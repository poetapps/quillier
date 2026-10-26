import time
from julia import load_model
t=time.time()
engine = load_model("../../models/julia-1", device="cpu", strict_encoding=True, max_length=8192, head_length=512)
print("load", round(time.time()-t,2),"s")
q={"team":{"type":"choice","instructions":"Which team should handle this request?","criteria":{"billing":"Billing and payment disputes","shipping":"Shipping and delivery","access":"Account access and login"}}}
for _ in range(3):
    t=time.time(); r=engine.predict(state="I was charged twice for the same order.", questions=q); print(round((time.time()-t)*1000),"ms", r["answers"]["team"]["choice"], {k:round(v,3) for k,v in r["answers"]["team"]["probabilities"].items()})
