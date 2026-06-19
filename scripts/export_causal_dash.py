import sys, json, glob, os, re
import numpy as np
sys.path.insert(0, "/mnt/g/My Drive/RuBase/Red lines/GNN-pipeline")
from tkg.run_training import load_snapshots
from tkg.predict.causal import CausalAnalyzer

SNAP_DIR = "/tmp/tkg_snapshots"
OUT = "/home/stephan/src/causal-dashboard/public/data"
snaps = load_snapshots(SNAP_DIR)
an = CausalAnalyzer()
PREDS = list(an.PREDICATES)
ts = an.extract_time_series(snaps)
files = sorted(glob.glob(os.path.join(SNAP_DIR, "snapshot_*.pt")))
dates = [re.search(r'_(\d{4}-\d{2}-\d{2})_', os.path.basename(f)).group(1) for f in files]
n = len(next(iter(ts.values()))); dates = dates[:n]

# predicate_timeseries — NESTED schema {dates, predicates:{...}, severity_rl, severity_nt}
# (the TimeSeries component requires data.predicates[p] + severity_rl/nt; a flat schema crashes it)
pts = {"dates": dates,
       "predicates": {p: [int(x) for x in ts[f"count_{p}"]] for p in PREDS if f"count_{p}" in ts},
       "severity_rl": [float(x) for x in ts.get("severity_RED_LINES", [0]*n)],
       "severity_nt": [float(x) for x in ts.get("severity_NUCLEAR_THREATS", [0]*n)]}
json.dump(pts, open(f"{OUT}/predicate_timeseries.json","w"))

# granger (all pairs) + network (sig). 110 pairs are tested, so raw p<0.05 over-claims —
# tag each edge with Benjamini-Hochberg FDR (q=0.05) + Bonferroni (family-wise) survival.
granger=[]
for s in PREDS:
    for t in PREDS:
        if s==t: continue
        ks,kt=f"count_{s}",f"count_{t}"
        if ks not in ts or kt not in ts: continue
        if np.std(ts[ks])<1e-10 or np.std(ts[kt])<1e-10: continue
        gc=an.granger_causality(ts[ks],ts[kt],max_lag=4)
        fstat=gc.get("f_stat",gc.get("F",0.0)); pval=gc.get("p_value",1.0)
        lag=gc.get("best_lag",gc.get("lag",1)); sig=bool(pval<0.05)
        granger.append({"source":s,"target":t,"f_stat":round(float(fstat),3),"p_value":round(float(pval),6),"lag":int(lag),"sig":sig})
# multiple-comparison flags
m=len(granger); bonf=0.05/m if m else 0.05
psort=sorted(g["p_value"] for g in granger); bh=0.0
for k,p in enumerate(psort,1):
    if p <= (k/m)*0.05: bh=p
for g in granger:
    g["bonf_sig"]=bool(g["p_value"]<bonf)
    g["fdr_sig"]=bool(g["p_value"]<=bh)
json.dump(granger, open(f"{OUT}/granger_results.json","w"))
network=[g for g in granger if g["sig"]]
json.dump(network, open(f"{OUT}/causal_network.json","w"))
json.dump({"n_tests":m,"bonferroni_threshold":round(bonf,6),"fdr_cutoff":round(bh,4),
           "n_raw_05":sum(g["sig"] for g in granger),"n_fdr":sum(g["fdr_sig"] for g in granger),
           "n_bonf":sum(g["bonf_sig"] for g in granger)}, open(f"{OUT}/significance_meta.json","w"), indent=1)

# correlation matrix
arrs=np.array([np.array(ts[f"count_{p}"],float) for p in PREDS])
cm=np.corrcoef(arrs)
json.dump({"predicates":PREDS,"matrix":[[round(float(x),4) if not np.isnan(x) else 0 for x in row] for row in cm]}, open(f"{OUT}/correlation_matrix.json","w"))

# cross-correlations for key pairs
def xcorr(x,y,ml=8):
    x=(x-x.mean())/(x.std()+1e-9); y=(y-y.mean())/(y.std()+1e-9); n=len(x); o=[]
    for L in range(-ml,ml+1):
        if L<0: c=np.corrcoef(x[:L],y[-L:])[0,1] if n+L>2 else 0
        elif L>0: c=np.corrcoef(x[L:],y[:-L])[0,1] if n-L>2 else 0
        else: c=np.corrcoef(x,y)[0,1]
        o.append(round(float(c) if not np.isnan(c) else 0,4))
    return o
kp=[("ATTACKS","RED_LINES"),("ATTACKS","NUCLEAR_THREATS"),("AIDS","RED_LINES"),("CONTROLS","RED_LINES"),("ARMS","RED_LINES"),("RED_LINES","LAUNCHES"),("THREATENS","RED_LINES")]
lags=list(range(-8,9)); xc=[]
for s,t in kp:
    xc.append({"source":s,"target":t,"lags":lags,"correlations":xcorr(np.array(ts[f"count_{s}"],float),np.array(ts[f"count_{t}"],float))})
json.dump(xc, open(f"{OUT}/cross_correlations.json","w"))

# summary_stats
totals={p:int(np.sum(ts[f"count_{p}"])) for p in PREDS}
json.dump({"n_snapshots":len(snaps),"date_start":dates[0],"date_end":dates[-1],"total_triples":sum(totals.values()),"predicate_totals":totals,"n_significant_granger":len(network),"n_predicates":len(PREDS),"confidence_threshold":0.135,"generated":"2026-06-19 DeepState+June"}, open(f"{OUT}/summary_stats.json","w"))
print("WROTE to",OUT,"| sig granger:",len(network),"of",len(granger),"| dates",dates[0],"->",dates[-1])
