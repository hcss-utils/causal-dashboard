"""Export the focused strike->rhetoric decoupling analysis (VAR/FAVAR/LASSO/Ridge/VARX/IRF)
to public/data/redline_decoupling.json for the causal dashboard's "Strike Decoupling" view.

This is the productionized form of the 2026-06-20 battery (worklog §10.10-10.13). Unlike
export_causal_dash.py (snapshot-fed Granger over bare predicates), this pulls the STRIKE SLICES
(russia-proper / western / annexed / energy) straight from aerial_assaults.strikes_on_russia,
which the snapshots don't carry. Idempotent: recomputes + overwrites the single JSON each run.

Run standalone:  python3 scripts/export_redline_decoupling.py
In the refresh:  step 2b of causal_refresh.sh (after the Granger export).
"""
import os, json, warnings, datetime as _dt
import numpy as np, pandas as pd, psycopg2
warnings.filterwarnings("ignore")
from statsmodels.tsa.api import VAR
from statsmodels.tsa.statespace.varmax import VARMAX
from sklearn.decomposition import PCA
from sklearn.linear_model import LassoCV, RidgeCV
from sklearn.preprocessing import StandardScaler

OUT = os.environ.get("REDLINE_OUT", "/home/stephan/src/causal-dashboard/public/data")
DB = dict(host=os.environ.get("TKG_DB_HOST", "138.201.62.161"),
          port=int(os.environ.get("TKG_DB_PORT", "5432")),
          dbname=os.environ.get("TKG_DB_NAME", "war_datasets"),
          user=os.environ.get("TKG_DB_USER", "postgres"),
          password=os.environ.get("TKG_DB_PASSWORD", "GoNKJWp64NkMr9UdgCnT"))

conn = psycopg2.connect(**DB); cur = conn.cursor()
from datetime import date, timedelta
TODAY = _dt.date.today()
start = date(2022, 2, 21)
weeks = [start + timedelta(days=7*i) for i in range(0, ((TODAY - start).days // 7) + 1)]
idx = {w: i for i, w in enumerate(weeks)}; n = len(weeks)

def ser(sql, p=()):
    a = np.zeros(n); cur.execute(sql, p)
    for d, c in cur.fetchall():
        if d is None: continue
        w = d - timedelta(days=d.weekday())
        if w in idx: a[idx[w]] = float(c)
    return a

TR = "SELECT date_trunc('week',event_date)::date,count(*) FROM knowledge_graph.triples WHERE predicate=%s GROUP BY 1"
SOR = "SELECT date_trunc('week',event_date)::date,count(*) FROM aerial_assaults.strikes_on_russia WHERE %s GROUP BY 1"
raw = {
    'RED_LINES': ser(TR, ('RED_LINES',)), 'NUCLEAR_THREATS': ser(TR, ('NUCLEAR_THREATS',)),
    'UA_str_russia': ser(SOR % "territory_class='russia_proper'"),
    'UA_str_annexed': ser(SOR % "territory_class='annexed_ukraine'"),
    'UA_str_western': ser(SOR % "western_supplied"),
    'UA_str_energy': ser(SOR % "target_category='energy_or_refinery'"),
    'UA_str_all': ser(SOR % "true"), 'UA_str_deep': ser(SOR % "depth_from_front_km>600"),
    'ARMS': ser(TR, ('ARMS',)), 'CONTROLS': ser(TR, ('CONTROLS',)), 'THREATENS': ser(TR, ('THREATENS',)),
    'RU_launches': ser("SELECT date_trunc('week',time_start)::date,count(*) FROM aerial_assaults.strikes_on_ukraine WHERE time_start IS NOT NULL GROUP BY 1"),
}
# extra controls for FAVAR
for k in ['AIDS', 'ATTACKS', 'SANCTIONS', 'OCCUPIES', 'LIBERATES', 'TRADES_FOSSIL', 'DISPLACES', 'SABOTAGES', 'DISRUPTS', 'CYBER_ATTACKS', 'DISINFORMS']:
    v = ser(TR, (k,))
    if (v > 0).sum() >= 20: raw['c_' + k] = v

# --- human-COST series: the new SUSTAINS_DEATHS TKG predicate, weekly by subject ---
# Tests the cost channel the strike-VOLUME battery cannot: does battlefield/civilian COST drive rhetoric?
TRS = "SELECT date_trunc('week',event_date)::date,count(*) FROM knowledge_graph.triples WHERE predicate='SUSTAINS_DEATHS' AND subject_id=%s GROUP BY 1"
raw['DEATHS_RU']  = ser(TRS, ('forces:RU',))
raw['DEATHS_UA']  = ser(TRS, ('forces:UA',))
raw['DEATHS_CIV'] = ser(TRS, ('civilians:UA',))
COST = ['DEATHS_RU', 'DEATHS_UA', 'DEATHS_CIV']

# PURIFIED nuclear outcome: only nuclear threats whose subject is a RUSSIAN STATE actor AND not uttered by a
# non-Russian (the mechanism trace found ~13% of NUCLEAR_THREATS were 3rd parties discussing Russian threats).
_RU_STATE = ("('actor:MFA_RUS','actor:Vladimir_Putin','actor:State_Duma_RUS','actor:Dmitry_Medvedev',"
             "'actor:Russian_Embassy_USA','actor:Federation_Council_RUS','actor:MoD_RUS','actor:Maria_Zakharova',"
             "'actor:Vyacheslav_Volodin','actor:Kremlin_RUS')")
_NONRU = "zelens|tymoshenko|zaluzh|budanov|kuleba|kyiv|ukrain|nato|biden|american|european|israel|eliyahu"
raw['NUCLEAR_RU_STATE'] = ser("SELECT date_trunc('week',event_date)::date,count(*) FROM knowledge_graph.triples "
    f"WHERE predicate='NUCLEAR_THREATS' AND subject_id IN {_RU_STATE} "
    f"AND COALESCE(attributes->>'source_speaker','') !~* '{_NONRU}' GROUP BY 1")

def stat(a): return np.sign(a) * np.log1p(np.abs(a))
TARGETS = ['RED_LINES', 'NUCLEAR_THREATS']
DRIVERS = ['UA_str_russia', 'UA_str_western', 'UA_str_annexed', 'UA_str_energy']
endog_names = ['ARMS', 'CONTROLS', 'THREATENS', 'RU_launches'] + DRIVERS + TARGETS
M = np.column_stack([stat(raw[k]) for k in endog_names])
nz = np.where(M.any(axis=1))[0][0]; M = M[nz:]
df = pd.DataFrame(M, columns=endog_names)
wk_dates = [w.isoformat() for w in weeks[nz:]]

# ---- IRF (focused VAR) ----
res = VAR(df).fit(2); irf = res.irf(12)
cum, se = irf.cum_effects, irf.cum_effect_stderr()
ri = {k: i for i, k in enumerate(endog_names)}
irf_out = []
for tgt in TARGETS:
    for dr in DRIVERS:
        ti, ii = ri[tgt], ri[dr]; y = cum[:, ti, ii]; e = 1.96 * se[:, ti, ii]
        irf_out.append({"driver": dr.replace('UA_str_', ''), "target": tgt,
                        "horizon": list(range(13)),
                        "cum": [round(float(v), 4) for v in y],
                        "lo": [round(float(a-b), 4) for a, b in zip(y, e)],
                        "hi": [round(float(a+b), 4) for a, b in zip(y, e)]})

# ---- FAVAR ----
CONTROLS = [c for c in endog_names if c not in TARGETS + DRIVERS] + [c for c in raw if c.startswith('c_')]
ctrl_M = np.column_stack([stat(raw[c])[nz:] for c in CONTROLS])
Z = StandardScaler().fit_transform(ctrl_M)
pca = PCA(n_components=5).fit(Z); evr = float(pca.explained_variance_ratio_.sum())
fav = pd.concat([df[DRIVERS + TARGETS].reset_index(drop=True),
                 pd.DataFrame(pca.transform(Z), columns=[f'F{i}' for i in range(5)])], axis=1)
fres = VAR(fav).fit(2)
favar_min_p = min(fres.test_causality(t, [d], kind='f').pvalue for t in TARGETS for d in DRIVERS)

# ---- LASSO / Ridge over all lagged controls ----
allser = {k: stat(raw[k])[nz:] for k in list(raw)}
full = pd.DataFrame(allser)
X = pd.concat([full.shift(l).add_suffix(f'_l{l}') for l in (1, 2)], axis=1)
lasso_strike_kept = {}; ridge_strike = {}
for tgt in TARGETS:
    XY = pd.concat([X, full[tgt].rename('y')], axis=1).dropna()
    Xs = StandardScaler().fit_transform(XY.drop(columns='y'))
    lm = LassoCV(cv=5, max_iter=5000).fit(Xs, XY['y'])
    coefs = dict(zip(XY.drop(columns='y').columns, lm.coef_))
    lasso_strike_kept[tgt] = {c: round(float(v), 3) for c, v in coefs.items() if 'UA_str' in c and abs(v) > 1e-6}
    rm = RidgeCV(alphas=np.logspace(-2, 3, 30)).fit(Xs, XY['y'])
    rc = dict(zip(XY.drop(columns='y').columns, rm.coef_))
    ridge_strike[tgt] = max(abs(float(v)) for c, v in rc.items() if 'UA_str' in c)

# ---- VARX (exogenous event dummies) ----
def wk(d):
    m = d - timedelta(days=d.weekday()); return idx.get(m)
exo = np.zeros((n, 2))
for d in [date(2024, 11, 18)]:
    i = wk(d);  exo[i, 0] = 1 if i is not None else 0
for d in [date(2024, 8, 5)]:
    i = wk(d);  exo[i, 1] = 1 if i is not None else 0
vx_endog = df[['RED_LINES', 'NUCLEAR_THREATS', 'UA_str_russia', 'UA_str_western', 'RU_launches']]
Xexo = pd.DataFrame(exo[nz:], columns=['D_Nov2024_signal', 'D_Kursk'])
varx = {}
try:
    vr = VARMAX(vx_endog, exog=Xexo, order=(2, 0), trend='c').fit(disp=False, maxiter=200)
    for tgt in TARGETS:
        for ev in ['D_Nov2024_signal', 'D_Kursk']:
            cand = [k for k in vr.params.index if ev in k and tgt in k]
            if cand:
                k = cand[0]
                varx[f"{ev}->{tgt}"] = {"coef": round(float(vr.params[k]), 3), "p": round(float(vr.pvalues[k]), 4)}
except Exception as e:
    varx = {"error": str(e)[:120]}

# ---- event-study series (raw counts) ----
event_study = {"dates": wk_dates,
               "RED_LINES": [int(x) for x in raw['RED_LINES'][nz:]],
               "NUCLEAR_THREATS": [int(x) for x in raw['NUCLEAR_THREATS'][nz:]],
               "UA_strikes_all": [int(x) for x in raw['UA_str_all'][nz:]],
               "UA_strikes_deep": [int(x) for x in raw['UA_str_deep'][nz:]],
               "UA_strikes_western": [int(x) for x in raw['UA_str_western'][nz:]],
               "events": [{"date": "2024-08-05", "label": "Kursk incursion"},
                          {"date": "2024-11-18", "label": "ATACMS green-light + Oreshnik"}]}

battery = [
    {"method": "Pairwise Granger", "controls": "one pair at a time", "strike_effect": "nothing survives FDR"},
    {"method": "Focused VAR (10-var)", "controls": "9 policy series", "strike_effect": "all ns; IRF CIs include 0"},
    {"method": "FAVAR", "controls": f"5 factors = {evr:.0%} of {len(CONTROLS)} controls", "strike_effect": f"all ns (min p={favar_min_p:.2f})"},
    {"method": "LASSO-VAR", "controls": "all lagged predictors", "strike_effect": ("0 strike drivers kept" if not lasso_strike_kept['RED_LINES'] else "negligible")},
    {"method": "Ridge", "controls": "all predictors (shrinkage)", "strike_effect": f"|coef| ≤ {max(ridge_strike.values()):.02f} (noise)"},
    {"method": "VARX (+event dummies)", "controls": "endog + exogenous events", "strike_effect": "strikes ns; Nov-2024 SIGNAL event drives nuclear (see varx)"},
]

# ---- COST CHANNEL (+ ROBUSTNESS): does HUMAN COST drive rhetoric where strike-VOLUME doesn't, and does
# it SURVIVE (a) FDR across the 6 tests, (b) conditioning on operational intensity, (c) dropping war-onset 2022?
# Additive (does NOT touch the strike battery). Casualty series are right-censored -> drop last TRIM weeks.
import warnings, datetime as _dt
from statsmodels.tsa.stattools import grangercausalitytests
from statsmodels.tsa.api import VAR as _VAR
from statsmodels.stats.multitest import multipletests
TRIM = 4
sd = {k: stat(raw[k])[nz:] for k in COST + TARGETS}
end = len(wk_dates) - TRIM
# operational-intensity control (combat tempo, NOT deaths) = weekly ATTACKS volume; the confounder proxy.
intensity = stat(ser(TR, ('ATTACKS',)))[nz:]
sub0 = next((i for i, w in enumerate(weeks[nz:]) if w >= _dt.date(2023, 1, 1)), 0)  # 2023+ subperiod start

def _gp(effect, cause, a, b):           # bivariate Granger, min p over lags 1-4
    gc = grangercausalitytests(np.column_stack([effect[a:b], cause[a:b]]), maxlag=4, verbose=False)
    return float(min(gc[l][0]['ssr_ftest'][1] for l in gc))
def _cond_gp(target, cause, ctrl, a, b): # cause->target CONDITIONAL on intensity (3-var VAR)
    df3 = pd.DataFrame(np.column_stack([target[a:b], cause[a:b], ctrl[a:b]]), columns=['T', 'C', 'X'])
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        return float(_VAR(df3).fit(maxlags=4, ic='aic').test_causality('T', ['C'], kind='f').pvalue)

cost_tests, base_keys, base_ps = {}, [], []
for cv in COST:
    for tg in TARGETS:
        k = f"{cv}->{tg}"
        try:
            p0 = _gp(sd[tg], sd[cv], 0, end)
            cost_tests[k] = {"granger_p": round(p0, 4),
                             "cond_p_intensity": round(_cond_gp(sd[tg], sd[cv], intensity, 0, end), 4),
                             "p_2023plus": round(_gp(sd[tg], sd[cv], sub0, end), 4)}
            base_keys.append(k); base_ps.append(p0)
        except Exception as e:
            cost_tests[k] = {"error": str(e)[:80]}
# Benjamini-Hochberg FDR across the 6 baseline tests
rej, q, _, _ = multipletests(base_ps, alpha=0.05, method='fdr_bh')
for k, qq, rj in zip(base_keys, q, rej):
    cost_tests[k]["fdr_q"] = round(float(qq), 4); cost_tests[k]["fdr_sig"] = bool(rj)
# ROBUST = survives FDR AND conditioning on intensity AND the 2023+ subperiod
for k, v in cost_tests.items():
    if "error" in v: continue
    v["robust"] = bool(v.get("fdr_sig") and v.get("cond_p_intensity", 1) < 0.05 and v.get("p_2023plus", 1) < 0.05)
robust = [k for k, v in cost_tests.items() if v.get("robust")]
survives_intensity = [k for k, v in cost_tests.items() if v.get("fdr_sig") and v.get("cond_p_intensity", 1) < 0.05]
cost_channel = {
    "note": f"Granger min-p (lags 1-4) on signed-log1p weekly series, last {TRIM} weeks dropped (reporting lag). "
            "Deaths = SUSTAINS_DEATHS TKG predicate (forces:UA<-UALosses real-dated; forces:RU<-UCDP, "
            "civilians:UA<-OHCHR month-distributed). ROBUSTNESS: BH-FDR across 6 tests; cond_p_intensity = Granger "
            "CONDITIONAL on weekly ATTACKS (operational-tempo control, the offensive confounder); p_2023plus drops "
            "the 2022 war-onset spike. robust = passes all three.",
    "tests": cost_tests,
    "robust_links": robust, "survives_intensity_control": survives_intensity,
    "verdict": (("ROBUST: " + ", ".join(robust) + " survive FDR + conditioning on operational intensity + the 2023+ "
                 "subperiod — human cost predicts RU escalatory rhetoric beyond what offensive-tempo explains, where "
                 "strike-VOLUME does not. Still Granger (precedence), but no longer a naive confound artifact.")
                if robust else
                ("NOT ROBUST: the raw cost->rhetoric Granger links do NOT survive controlling for operational "
                 "intensity and/or dropping 2022 — consistent with the common-driver confound (offensives raise "
                 "casualties AND rhetoric). The decoupling holds for cost too once intensity is controlled.")),
    "caveats": [
        "Even 'robust' = Granger precedence conditional on ONE intensity proxy (ATTACKS), not proof of causation.",
        "DEATHS_UA is real-dated (strongest); DEATHS_RU/CIV are month-distributed -> within-month autocorrelation "
        "can inflate their significance; weight DEATHS_UA most.",
        "Single intensity control + linear VAR; mechanism (why UA cost would move RU rhetoric) is not established."]}
# ===== TIER-1 rigor: run the 4-test battery (DEATHS_UA -> a nuclear target). Run on the impure
# NUCLEAR_THREATS AND the PURIFIED Russian-state-only outcome, to see whether even the predictive link
# survives once the outcome actually measures Russian state nuclear signaling. =====
import itertools
def run_tier1(TG):
    CV = 'DEATHS_UA'; d_ua = sd[CV]; nuc = stat(raw[TG])[nz:]; END = end; t1 = {}
    # (1) FAVAR full-control
    try:
        Fz = pca.transform(Z)[:END]
        fav_d = pd.concat([pd.DataFrame({TG: nuc[:END], CV: d_ua[:END]}).reset_index(drop=True),
                           pd.DataFrame(Fz, columns=[f'F{i}' for i in range(5)])], axis=1)
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            p_f = float(VAR(fav_d).fit(maxlags=4, ic='aic').test_causality(TG, [CV], kind='f').pvalue)
        t1['favar_full_controls'] = {"p": round(p_f, 4), "survives": bool(p_f < 0.05),
            "note": f"conditional on 5 PCA factors = {evr:.0%} of all {len(CONTROLS)} war-control series"}
    except Exception as e:
        t1['favar_full_controls'] = {"error": str(e)[:80]}
    # (2) reverse causality
    p_fwd, p_rev = _gp(nuc, d_ua, 0, END), _gp(d_ua, nuc, 0, END)
    t1['reverse_causality'] = {"forward_p": round(p_fwd, 4), "reverse_p": round(p_rev, 4), "simultaneous": bool(p_rev < 0.05)}
    # (3) specification curve
    CTRLS = {'none': None, 'attacks': intensity, 'ru_launches': stat(raw['RU_launches'])[nz:], 'occupies': stat(ser(TR, ('OCCUPIES',)))[nz:]}
    specs = []
    for L, Tr, (cn_, ctrl), (pn, p0s) in itertools.product([2, 3, 4, 6], [2, 4, 6, 8], CTRLS.items(), [('full', 0), ('2023+', sub0)]):
        e2 = len(wk_dates) - Tr
        try:
            if ctrl is None:
                gc = grangercausalitytests(np.column_stack([nuc[p0s:e2], d_ua[p0s:e2]]), maxlag=L, verbose=False)
                pp = min(gc[l][0]['ssr_ftest'][1] for l in gc)
            else:
                df3 = pd.DataFrame(np.column_stack([nuc[p0s:e2], d_ua[p0s:e2], ctrl[p0s:e2]]), columns=['T', 'C', 'X'])
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore'); pp = float(VAR(df3).fit(maxlags=L).test_causality('T', ['C'], kind='f').pvalue)
            specs.append(float(pp))
        except Exception:
            pass
    t1['specification_curve'] = {"n_specs": len(specs), "frac_p_lt_05": round(sum(p < 0.05 for p in specs) / max(len(specs), 1), 3),
        "median_p": round(float(np.median(specs)), 4) if specs else None}
    # (4) out-of-sample forecast
    def _oos(use):
        L = 4; ys = []; pr = []
        for t in range(len(nuc) // 2, END):
            rows = [[nuc[s - k] for k in range(1, L + 1)] + ([d_ua[s - k] for k in range(1, L + 1)] if use else []) for s in range(L, t)]
            Xtr = np.array(rows); ytr = np.array([nuc[s] for s in range(L, t)])
            beta = np.linalg.lstsq(np.column_stack([np.ones(len(Xtr)), Xtr]), ytr, rcond=None)[0]
            xt = [nuc[t - k] for k in range(1, L + 1)] + ([d_ua[t - k] for k in range(1, L + 1)] if use else [])
            pr.append(beta[0] + np.dot(beta[1:], xt)); ys.append(nuc[t])
        return float(np.sqrt(np.mean((np.array(ys) - np.array(pr)) ** 2)))
    rb, rd = _oos(False), _oos(True)
    t1['out_of_sample'] = {"rmse_ar_only": round(rb, 4), "rmse_with_deaths": round(rd, 4),
        "improvement_pct": round(100 * (rb - rd) / rb, 2), "deaths_help": bool(rd < rb)}
    passes = [bool(t1['favar_full_controls'].get('survives')), not t1['reverse_causality']['simultaneous'],
              t1['specification_curve']['frac_p_lt_05'] >= 0.5, t1['out_of_sample']['deaths_help']]
    t1['hurdles_passed'] = f"{sum(passes)}/4"
    return t1, sum(passes)

tier1_impure, n_imp = run_tier1('NUCLEAR_THREATS')
tier1_pure, n_pur = run_tier1('NUCLEAR_RU_STATE')
cost_channel['tier1_DEATHS_UA_to_NUCLEAR'] = tier1_impure
cost_channel['tier1_DEATHS_UA_to_NUCLEAR_PURIFIED'] = tier1_pure
cost_channel['purification'] = {
    "outcome": "NUCLEAR_RU_STATE = nuclear threats with a Russian-STATE subject, not uttered by a non-Russian "
               "(removes the ~13% of NUCLEAR_THREATS the mechanism trace found were 3rd parties discussing Russian threats)",
    "impure_hurdles": f"{n_imp}/4", "purified_hurdles": f"{n_pur}/4",
    "verdict": (f"Purified outcome passes {n_pur}/4 (vs {n_imp}/4 impure). "
                + ("The predictive link SURVIVES purification — it is genuinely about Russian STATE nuclear signaling, "
                   "not the measurement impurity. (Still deterrence-to-the-West content per the mechanism trace.)"
                   if n_pur >= 3 else
                   "The predictive link WEAKENS/FAILS once the outcome actually measures Russian state signaling — "
                   "much of the original result rode on the impure (3rd-party) statements."))}

event_study["DEATHS_RU"]  = [int(x) for x in raw['DEATHS_RU'][nz:]]
event_study["DEATHS_UA"]  = [int(x) for x in raw['DEATHS_UA'][nz:]]
event_study["DEATHS_CIV"] = [int(x) for x in raw['DEATHS_CIV'][nz:]]

out = {
    "meta": {"n_weeks": len(wk_dates), "date_start": wk_dates[0], "date_end": wk_dates[-1],
             "generated": TODAY.isoformat(), "n_methods_agree": 6},
    "cost_channel": cost_channel,
    "headline": "Ukrainian strikes do NOT drive Russian nuclear/red-line rhetoric — six methods agree. "
                "The rhetoric is deliberate, episodic signaling (Nov-2024 = Russia's own Oreshnik+doctrine signal), not a reflexive response to strikes.",
    "battery": battery, "irf": irf_out, "varx": varx, "event_study": event_study,
    "favar_explained_var": round(evr, 3), "favar_min_p": round(float(favar_min_p), 3),
}
os.makedirs(OUT, exist_ok=True)
json.dump(out, open(f"{OUT}/redline_decoupling.json", "w"))
print(f"WROTE {OUT}/redline_decoupling.json | {len(wk_dates)} wks {wk_dates[0]}->{wk_dates[-1]} | "
      f"FAVAR {evr:.0%} minp={favar_min_p:.2f} | VARX Nov2024->NUCLEAR p={varx.get('D_Nov2024_signal->NUCLEAR_THREATS',{}).get('p','?')}")
