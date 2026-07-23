// Tab6GAN.jsx — GAN Eğitimi + Ekstrinsik Faktörler + Zenginleştirilmiş Sentetik Hastalar

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useLang } from "../../i18n/LangContext";
import { DRUG_PALETTE, drugColor, drugLabel, SIMULABLE_DRUG_KEYS } from "../../constants/drugConfig";
import HowToUse from "../ui/HowToUse";

const BASE = "/api/v1";
const tok  = () => localStorage.getItem("sting_token");
async function api(path, opts={}) {
  const res = await fetch(`${BASE}${path}`, {
    headers:{ Authorization:`Bearer ${tok()}`, "Content-Type":"application/json" }, ...opts
  });
  // DELETE gibi boş yanıt dönebilen metodlar için güvenli parse
  let d = {};
  try { d = await res.json(); } catch {}
  if (!res.ok) throw new Error(d.detail || `HTTP ${res.status}`);
  return d;
}
const apiPost = (p,b) => api(p,{method:"POST",body:JSON.stringify(b)});
const apiGet  = (p)   => api(p);
const apiDel  = (p)   => api(p,{method:"DELETE"});


// ── GAN v2 Hasta Dönüştürücü ─────────────────────────────────────────────────
// synthetic_drug10.csv satırını → mevcut DSS GANPatientModal formatına çevirir
function _ganV2ToPatient(p) {
  if (!p) return null;
  const cl = p.clinical || {};
  const ex = p.extrinsic || {};
  const sum= p.summary   || {};
  const gnn= p.gnn_v2    || {};

  // Risk sınıfı mapping
  const riskMap = { LR:"lr", SR:"sr", IR:"ir", HR:"hr", VHR:"vhr",
                    lr:"lr", sr:"sr", ir:"ir", hr:"hr", vhr:"vhr" };
  const riskClass = riskMap[p.risk_class] || "ir";

  // GNN v2 kalite skoru
  const gnnQuality = gnn.quality || null;
  const gnnSummary = gnn.summary || {};

  // Prognostik skorlar — CSV referans havuzundan gelir
  const piCog   = parseFloat(ex.resp_pi_cog_score  || cl.resp_pi_cog_score  || 0);
  const piUkall = parseFloat(ex.resp_pi_ukall_score || cl.resp_pi_ukall_score || 0);

  // Prognostik risk skoru — backend'den gelir
  const extRisk = parseFloat(p.extrinsic_risk_score || 0);

  // MRD trajektori — CSV referans havuzundan gelir
  const mrdD29 = parseFloat(ex.resp_mrd_d29_pct || cl.mrd_d29  || 0);
  const mrdEoc = parseFloat(ex.resp_eoc_mrd_pct  || cl.mrd_eoc  || 0);
  const mrdD8  = parseFloat(cl.mrd_d8 || (mrdD29 * 3) || 0);

  return {
    patient_id:         p.patient_id || ("SYN_" + Math.random().toString(36).slice(2,8)),
    risk_class:         riskClass,
    extrinsic_risk_score: extRisk,
    source:             "gan_v2",

    // GNN v2 doğrulama
    gnn_v2_quality:     gnnQuality,
    gnn_v2_summary:     gnnSummary,
    gnn_v2_trajectories: gnn.trajectories || null,

    // Klinik — DSS hasta modalı için
    clinical: {
      age:           parseFloat(cl.age || ex.age || 8),
      sex:           cl.sex || ex.sex || "M",
      weight_kg:     parseFloat(cl.weight_kg || 30),
      height_cm:     parseFloat(cl.height_cm || 120),
      bsa:           parseFloat(cl.bsa || ex.bsa || 0.9),
      tpmt:          parseFloat(cl.tpmt || ex.tpmt || 1),
      vitamin_d:     parseFloat(cl.vitamin_d || 28),
      wbc0:          parseFloat(cl.wbc0 || ex.baseline_wbc || 4.5),
      anc0:          parseFloat(cl.anc0 || ex.baseline_anc || 2.36),
      // Doz bilgileri
      dose_6mp_mg:   50,
      dose_mtx_mg:   20,
      dose_vcr_mg:   1.5,
      dose_dnr_mg_m2: parseFloat(cl.dose_dnr_mg_m2 || ex.dose_dnr_mg_m2 || 25),
      peg_dose_per_m2: parseFloat(cl.peg_dose_per_m2 || 2500),
      dose_ster_mg_m2: parseFloat(cl.dose_ster_mg_m2 || 60),
      // Prognostik
      resp_pi_cog_score:  piCog,
      resp_pi_ukall_score: piUkall,
      active_drugs:  cl.active_drugs || [],
      t_end:         parseFloat(cl.t_end || 250),
      // MRD
      mrd_d8:   mrdD8,
      mrd_d29:  mrdD29,
      mrd_eoc:  mrdEoc,
    },

    // Ekstrinsik faktörler — GAN v2 zengin profil
    extrinsic: {
      // Genetik
      gen_etv6_runx1:   ex.gen_etv6_runx1   ? 1 : 0,
      gen_high_hyperdip: ex.gen_high_hyperdip ? 1 : 0,
      gen_bcr_abl1:     ex.gen_bcr_abl1     ? 1 : 0,
      gen_ph_like:      ex.gen_ph_like       ? 1 : 0,
      gen_ikzf1_del:    ex.gen_ikzf1_del     ? 1 : 0,
      gen_kmt2a_r:      ex.gen_kmt2a_r       ? 1 : 0,
      gen_hypodiploidy: ex.gen_hypodiploidy  ? 1 : 0,
      // Farmakogenetik
      phg_tpmt_status:  ex.phg_tpmt_status || "normal",
      phg_nudt15_r139c: ex.phg_nudt15_r139c  ? 1 : 0,
      // Klinik
      pat_all_subtype:  ex.pat_all_subtype   || "B-ALL",
      pat_cns_status:   ex.pat_cns_status    || "CNS1",
      // Yanıt
      resp_steroid_d8_pgr: ex.resp_steroid_d8_pgr ? 1 : 0,
      resp_bm_d15_morph:   ex.resp_bm_d15_morph   || "M1",
      mrd_eoi:          mrdD29,
      // Sosyodemografik
      ses_index:        parseFloat(ex.ses_index || 0.5),
      infection_history: ex.infection || ex.infection_history || 0,
      eth_group:        ex.eth_group || "",
      // Tedavi yanıtı
      resp_steroid_d8_pgr: ex.resp_steroid_d8_pgr || 0,
      resp_bm_d15_morph:   ex.resp_bm_d15_morph || "M1",
      // Prognostik skorlar
      resp_pi_cog_score:  piCog,
      resp_pi_ukall_score: piUkall,
      pi_interpretation_text: ex.pi_interpretation_text || ex.risk_reasons || "",
      // EFS/OS
      efs_5y_lower:     parseFloat(ex.prog_efs_5y_lower || ex.efs_5y_lower || 75),
      efs_5y_upper:     parseFloat(ex.prog_efs_5y_upper || ex.efs_5y_upper || 90),
      prog_relapse_risk_cat: ex.prog_relapse_risk_cat || "intermediate",
      risk_reasons:     ex.risk_reasons || ex.pi_interpretation_text || "",
      // Toksisite
      adv_VIPN_min:     parseFloat(ex.adv_VIPN_min || 0.7),
      adv_BRR_d8:       parseFloat(ex.adv_BRR_d8 || 0.97),
      adv_cum_DNR_mgm2: parseFloat(ex.adv_cum_DNR_mgm2 || 150),
      // MRD
      mrd_d8:   mrdD8,
      mrd_d29:  mrdD29,
      mrd_eoc:  mrdEoc,
    },

    summary: {
      wbc_min:          parseFloat(sum.wbc_min || gnnSummary.WBC_min || 1.5),
      anc_min:          parseFloat(sum.anc_min || gnnSummary.ANC_min || 0.5),
      vipn_min:         parseFloat(sum.vipn_min || gnnSummary.VIPN_N_min || 0.75),
      BRR_d8:           parseFloat(sum.BRR_d8  || ex.adv_BRR_d8  || 97),
      EOI_MRD:          mrdD29 / 100,
      cum_DNR:          parseFloat(sum.cum_DNR || ex.adv_cum_DNR_mgm2 || 150),
      wbc_in_target_pct: 50,
    },
  };
}

const RISK_COLORS = {
  lr:       "#10b981",
  sr:       "#34d399",
  ir:       "#f59e0b",
  hr:       "#ef4444",
  vhr:      "#7c3aed",
  // geriye uyum
  standard: "#10b981",
  high:     "#ef4444",
  critical: "#7c3aed",
};
const RISK_LABELS_TR = {
  lr:"Düşük Risk (LR)",  sr:"Standart Risk (SR)", ir:"Orta Risk (IR)",
  hr:"Yüksek Risk (HR)", vhr:"Ç.Y. Risk (VHR)",
  standard:"Standart Risk", high:"Yüksek Risk", critical:"Kritik Risk", // geriye uyum
};
const RISK_LABELS_EN = {
  lr:"Low Risk (LR)",      sr:"Standard Risk (SR)", ir:"Intermediate Risk (IR)",
  hr:"High Risk (HR)",     vhr:"V.H. Risk (VHR)",
  standard:"Standard Risk", high:"High Risk", critical:"Critical Risk",
};
const RISK_EFS = {
  lr:"~95–98% EFS", sr:"~85–95% EFS", ir:"~75–88% EFS",
  hr:"~60–80% EFS", vhr:"~30–60% EFS",
};
const RISK_DESC_TR = {
  lr:"Yaş 1–10y, WBC<50, favorable genomik, MRD<%0.01 — tedavi yoğunluğu azaltılabilir",
  sr:"Standart klinik profil, nötr genomik, derin MRD negatifliği — standart protokol yeterli",
  ir:"Yaş≥10y veya WBC≥50 veya MRD 0.01–0.1% — kinetiğe göre yoğunlaştırma",
  hr:"Adverse genomik/CNS3/PPR/MRD≥%0.1 — indüksiyon sonrası yoğunlaştırma zorunlu",
  vhr:"BCR-ABL1/KMT2A/hipodiploidi veya MRD≥%1 — hedefe yönelik tedavi/HSCT/CAR-T",
};
const RISK_DESC_EN = {
  lr:"Age 1–10y, WBC<50, favorable genomics, MRD<0.01% — de-intensification feasible",
  sr:"Standard clinical profile, neutral genomics, deep MRD negativity — standard protocol sufficient",
  ir:"Age≥10y or WBC≥50 or MRD 0.01–0.1% — intensification guided by kinetics",
  hr:"Adverse genomics/CNS3/PPR/MRD≥0.1% — post-induction intensification required",
  vhr:"BCR-ABL1/KMT2A/hypodiploidy or MRD≥1% — targeted therapy/HSCT/CAR-T",
};

// ══════════════════════════════════════════════════════════════════════════════
// GAN Diyagram Animasyonu — Kutu tabanlı, gerçek GAN akışı
// ══════════════════════════════════════════════════════════════════════════════
function GANArchViz({ dark, phase="idle", epoch=0, maxEpoch=500, gLoss=null, dLoss=null }) {
  const d   = dark;
  const run  = phase==="training";
  const done = phase==="done";
  const animRef = useRef(null);
  const [tick, setTick] = useState(0);

  useEffect(()=>{
    if(!run){cancelAnimationFrame(animRef.current);return;}
    const loop=()=>{setTick(t=>t+1);animRef.current=requestAnimationFrame(loop);};
    animRef.current=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(animRef.current);
  },[run]);

  const t = tick/60;
  const pct = maxEpoch>0 ? Math.min(epoch/maxEpoch,1) : 0;
  const bg  = d?"#070d1a":"#fff7ed";

  // Sinyal animasyonu — 0..1 arası yürüyen nokta
  const sig1 = (t*0.4)%1;   // Noise→Generator
  const sig2 = (t*0.4+0.33)%1; // Generator→Discriminator (fake)
  const sig3 = (t*0.4+0.66)%1; // Real Data→Discriminator

  // Kutu renkleri
  const noiseCol   = run?"#a78bfa":done?"#34d399":"#334155";
  const genCol     = run?"#f97316":done?"#34d399":"#334155";
  const realCol    = run?"#38bdf8":done?"#34d399":"#334155";
  const discCol    = run?"#818cf8":done?"#34d399":"#334155";
  const outCol     = done?"#10b981":run?"#fbbf24":"#334155";

  // Koordinatlar — kutular
  const boxes = {
    noise: {x:30,  y:60,  w:90, h:50,  col:noiseCol, lbl:"Random\nNoise", sub:"z~N(0,1)"},
    gen:   {x:180, y:45,  w:110,h:80,  col:genCol,   lbl:"Generator",     sub:"G(z)→patient"},
    real:  {x:30,  y:150, w:90, h:50,  col:realCol,  lbl:"Real Data",     sub:"GNN summaries"},
    disc:  {x:370, y:72,  w:110,h:80,  col:discCol,  lbl:"Discriminator", sub:"D(x)→P(real)"},
    out:   {x:560, y:87,  w:90, h:50,  col:outCol,   lbl:"P(real)",       sub:"0=fake,1=real"},
  };

  const bx=(b,ox=0)=>b.x+ox; const by=(b,oy=0)=>b.y+oy;
  const bmx=(b)=>b.x+b.w/2;  const bmy=(b)=>b.y+b.h/2;
  const brx=(b)=>b.x+b.w;    const bby=(b)=>b.y+b.h;

  // Ok çiz
  const Arrow=({x1,y1,x2,y2,col,dash=false,label=""})=>{
    const dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy);
    const ux=dx/len, uy=dy/len;
    const mx=(x1+x2)/2, my=(y1+y2)/2;
    return <g>
      <line x1={x1} y1={y1} x2={x2-ux*6} y2={y2-uy*6}
        stroke={col} strokeWidth="1.8"
        strokeDasharray={dash?"5,3":"none"} opacity={run||done?0.85:0.25}/>
      <polygon points={`${x2},${y2} ${x2-ux*8-uy*4},${y2-uy*8+ux*4} ${x2-ux*8+uy*4},${y2-uy*8-ux*4}`}
        fill={col} opacity={run||done?0.85:0.25}/>
      {label&&<text x={mx} y={my-5} textAnchor="middle" fontSize="7" fill={col} opacity="0.7"
        fontFamily="system-ui">{label}</text>}
    </g>;
  };

  // Sinyal topu pozisyonu
  const sigPos=(x1,y1,x2,y2,p)=>({x:x1+(x2-x1)*p, y:y1+(y2-y1)*p});

  // Geri yayılım oku (kesik kırmızı)
  const BackProp=({x1,y1,x2,y2,label=""})=>(
    run?<g>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="#ef4444" strokeWidth="1.2" strokeDasharray="4,3" opacity="0.5">
        <animate attributeName="stroke-dashoffset" values="0;-14" dur="0.5s" repeatCount="indefinite"/>
      </line>
      {label&&<text x={(x1+x2)/2} y={(y1+y2)/2+10} textAnchor="middle" fontSize="6.5"
        fill="#ef4444" opacity="0.6" fontFamily="monospace">{label}</text>}
    </g>:null
  );

  // Kutu bileşeni
  const Box=({b,glow=false})=>{
    const pulse=run?0.5+0.5*Math.sin(t*2.5):0;
    const glowR=glow&&run?`0 0 ${12+8*pulse}px ${b.col}55`:"none";
    const lines=b.lbl.split("\n");
    return <g>
      {(run||done)&&<rect x={b.x-4} y={b.y-4} width={b.w+8} height={b.h+8} rx="14"
        fill={b.col} opacity={run?0.04+0.04*pulse:0.03}/>}
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="10"
        fill={d?`${b.col}15`:`${b.col}10`}
        stroke={b.col} strokeWidth={run?2:done?1.5:0.8}
        strokeOpacity={run||done?1:0.3}/>
      {lines.map((ln,i)=>(
        <text key={i} x={bmx(b)} y={bmy(b)+(i-lines.length/2+0.5)*14}
          textAnchor="middle" fontSize="9" fontWeight="700"
          fill={b.col} fontFamily="system-ui" opacity={run||done?1:0.5}>{ln}</text>
      ))}
      <text x={bmx(b)} y={bby(b)-6} textAnchor="middle" fontSize="6.5"
        fill={d?"#475569":"#92400e"} fontFamily="monospace" opacity="0.65">{b.sub}</text>
    </g>;
  };

  const nb=boxes.noise, gb=boxes.gen, rb=boxes.real, db=boxes.disc, ob=boxes.out;

  // Ok koordinatları
  const A={
    noiseGen:   [brx(nb), bmy(nb), nb.x+nb.w+2, bmy(gb)],  // Noise→Gen
    genDisc:    [brx(gb), bmy(gb), db.x-2, db.y+30],         // Gen→Disc (fake)
    realDisc:   [brx(rb), bmy(rb), db.x-2, db.y+50],         // Real→Disc
    discOut:    [brx(db), bmy(db), ob.x-2, bmy(ob)],          // Disc→Out
    backDisc:   [bmx(db), db.y, bmx(gb), bby(gb)+2],          // Geri yayılım D→G
    backGen:    [gb.x+20, gb.y, nb.x+70, bby(nb)+2],          // Geri yayılım G→Noise
  };

  const sp1=run?sigPos(A.noiseGen[0],A.noiseGen[1],A.noiseGen[2],A.noiseGen[3],sig1):null;
  const sp2=run?sigPos(A.genDisc[0],A.genDisc[1],A.genDisc[2],A.genDisc[3],sig2):null;
  const sp3=run?sigPos(A.realDisc[0],A.realDisc[1],A.realDisc[2],A.realDisc[3],sig3):null;

  return (
    <div>
    <div className={`rounded-2xl overflow-hidden border ${d?"border-amber-900/40":"border-amber-200"}`}
         style={{background:bg,boxShadow:run?"0 0 40px rgba(249,115,22,0.10)":"none"}}>
      <svg viewBox="0 0 700 205" style={{width:"100%",height:"auto"}}>

        {/* Arka plan ızgara */}
        {Array.from({length:12}).map((_u, i)=>(
          <line key={`h${i}`} x1={0} y1={i*20} x2={700} y2={i*20}
            stroke={d?"#0d1829":"#fef3c7"} strokeWidth="0.5"/>
        ))}

        {/* Etiketler — Sahte / Gerçek ayrımı */}
        {(run||done)&&<>
          <text x={bmx(gb)} y={gb.y-8} textAnchor="middle" fontSize="7.5"
            fill="#f97316" fontFamily="system-ui" fontWeight="700" opacity="0.8">
            {run?"⚡ FAKE":"SYNTHETIC"}
          </text>
          <text x={bmx(rb)} y={rb.y-8} textAnchor="middle" fontSize="7.5"
            fill="#38bdf8" fontFamily="system-ui" fontWeight="700" opacity="0.8">REAL</text>
        </>}

        {/* İleri yayılım okları */}
        <Arrow x1={A.noiseGen[0]} y1={A.noiseGen[1]} x2={A.noiseGen[2]} y2={A.noiseGen[3]}
          col={noiseCol} label={run?"forward":""}/>
        <Arrow x1={A.genDisc[0]} y1={A.genDisc[1]} x2={A.genDisc[2]} y2={A.genDisc[3]}
          col={genCol} label={run?"fake→":""}/>
        <Arrow x1={A.realDisc[0]} y1={A.realDisc[1]} x2={A.realDisc[2]} y2={A.realDisc[3]}
          col={realCol} label={run?"real→":""}/>
        <Arrow x1={A.discOut[0]} y1={A.discOut[1]} x2={A.discOut[2]} y2={A.discOut[3]}
          col={discCol}/>

        {/* Geri yayılım — loss sinyali */}
        <BackProp x1={A.backDisc[0]} y1={A.backDisc[1]} x2={A.backDisc[2]} y2={A.backDisc[3]}
          label="∂Loss"/>
        <BackProp x1={A.backGen[0]} y1={A.backGen[1]} x2={A.backGen[2]} y2={A.backGen[3]}/>

        {/* Kutular */}
        <Box b={nb}/><Box b={gb} glow/><Box b={rb}/><Box b={db} glow/><Box b={ob}/>

        {/* Sinyal topları */}
        {sp1&&<g>
          <circle cx={sp1.x} cy={sp1.y} r={4.5} fill={noiseCol} opacity="0.9"/>
          <circle cx={sp1.x} cy={sp1.y} r={8} fill="none" stroke={noiseCol} strokeWidth="1" opacity="0.3"/>
        </g>}
        {sp2&&<g>
          <circle cx={sp2.x} cy={sp2.y} r={4.5} fill={genCol} opacity="0.9"/>
          <circle cx={sp2.x} cy={sp2.y} r={8} fill="none" stroke={genCol} strokeWidth="1" opacity="0.3"/>
        </g>}
        {sp3&&<g>
          <circle cx={sp3.x} cy={sp3.y} r={4.5} fill={realCol} opacity="0.9"/>
          <circle cx={sp3.x} cy={sp3.y} r={8} fill="none" stroke={realCol} strokeWidth="1" opacity="0.3"/>
        </g>}

        {/* Discriminator çıkış etiketi */}
        {(run||done)&&(
          <text x={brx(ob)+5} y={bmy(ob)+4} fontSize="9" fill={outCol}
            fontFamily="monospace" fontWeight="800" opacity="0.9">
            {done?"✓":run?(gLoss!=null?(gLoss<0.5?"~real":"~fake"):"?"):"?"}
          </text>
        )}

        {/* Done badge */}
        {done&&<g transform="translate(680,15)">
          <circle r="9" fill="#10b981" opacity="0.9"/>
          <text x={0} y={4} textAnchor="middle" fontSize="12" fill="white" fontWeight="bold">✓</text>
        </g>}
        {run&&<g transform="translate(680,15)">
          <circle r="7" fill="#f97316" opacity="0.7">
            <animate attributeName="r" values="5;10;5" dur="1.2s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.7;0.2;0.7" dur="1.2s" repeatCount="indefinite"/>
          </circle>
          <circle r="4" fill="#f97316" opacity="0.9"/>
        </g>}
      </svg>
    </div>

    {/* Progress bar ve loss — mimari görselin altında */}
    {(run||done)&&(
      <div className={`rounded-xl px-4 py-2.5 ${d?"bg-slate-800/60":"bg-amber-50/60"}`}>
        <div className="flex items-center gap-3 mb-1.5">
          <span className={`text-xs font-mono font-bold ${done?"text-emerald-400":"text-orange-400"}`}>
            {done?"✓ Done":"▶"} epoch {epoch}/{maxEpoch}
          </span>
          <div className="flex gap-3 text-xs font-mono ml-auto">
            <span style={{color:"#f97316"}}>G: {gLoss?.toFixed(5)??"—"}</span>
            <span style={{color:"#818cf8"}}>D: {dLoss?.toFixed(5)??"—"}</span>
          </div>
        </div>
        <div className={`w-full rounded-full h-2 ${d?"bg-slate-700":"bg-amber-100"}`}>
          <div className="h-2 rounded-full transition-all duration-300"
            style={{width:`${pct*100}%`,
              background:done?"#10b981":"linear-gradient(90deg,#f97316,#f59e0b,#f97316)",
              backgroundSize:"200% 100%"}}/>
        </div>
      </div>
    )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GAN Konsolu

// ══════════════════════════════════════════════════════════════════════════════
function GANConsole({ dark, phase, epoch, maxEpoch, gLosses, dLosses, trainResult, isEN }) {
  const d=dark, run=phase==="training", done=phase==="done";
  const gl=trainResult?.final_g_loss??gLosses[gLosses.length-1];

  const LossChart=()=>{
    if(gLosses.length<2) return null;
    const W=360,H=80;
    const allLosses=[...gLosses,...dLosses].filter(v=>v!=null);
    const mn=Math.min(...allLosses)*0.95, mx=Math.max(...allLosses)*1.05, rng=mx-mn||0.001;
    const gpts=gLosses.map((v,i)=>`${16+(i/(gLosses.length-1))*(W-32)},${H-12-((v-mn)/rng)*(H-24)}`).join(" ");
    const dpts=dLosses.filter(v=>v!=null).map((v,i)=>`${16+(i/(dLosses.length-1))*(W-32)},${H-12-((v-mn)/rng)*(H-24)}`).join(" ");
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className={`text-xs font-semibold ${d?"text-slate-400":"text-amber-700"}`}>G Loss / D Loss</p>
          <div className="flex gap-2 text-xs">
            <span className="text-orange-400">G:{gl?.toFixed(5)??"—"}</span>
            <span className={d?"text-slate-500":"text-slate-400"}>D:{trainResult?.final_d_loss?.toFixed(5)??"—"}</span>
          </div>
        </div>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`}
          style={{borderRadius:10,background:d?"#070d1a":"#fff7ed",border:`1px solid ${d?"#1e293b":"#fed7aa"}`}}>
          <defs>
            <linearGradient id="glg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.3"/>
              <stop offset="100%" stopColor="#f97316" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {[0.25,0.5,0.75].map(r=>(
            <line key={r} x1={16} y1={12+r*(H-24)} x2={W-16} y2={12+r*(H-24)}
              stroke={d?"#0d1829":"#fef3c7"} strokeWidth="1"/>
          ))}
          <polyline points={`16,${H-12} ${gpts} ${W-16},${H-12}`} fill="url(#glg)" opacity="0.2"/>
          <polyline points={gpts} fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round"/>
          {dpts&&<polyline points={dpts} fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3,2"/>}
        </svg>
        <div className="flex gap-3 mt-1 text-xs">
          <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-orange-400"/><span className={d?"text-slate-500":"text-slate-400"}>Generator</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-violet-400 opacity-70" style={{borderTop:"1px dashed"}}/>
            <span className={d?"text-slate-500":"text-slate-400"}>Discriminator</span></div>
        </div>
      </div>
    );
  };

  return (
    <div className={`rounded-2xl border font-mono text-xs overflow-hidden ${d?"bg-[#070d1a] border-amber-900/30":"bg-[#fff7ed] border-amber-200"}`}>
      <div className={`flex items-center gap-2 px-4 py-2 border-b ${d?"border-slate-800 bg-[#0d1829]":"border-amber-100 bg-[#fef3c7]"}`}>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400"/>
          <div className="w-3 h-3 rounded-full bg-amber-400"/>
          <div className="w-3 h-3 rounded-full bg-emerald-400"/>
        </div>
        <span className={`text-xs ${d?"text-slate-500":"text-amber-700"}`}>
          gan_training_console — {phase==="idle"?"standby":phase==="training"?"running...":phase==="done"?"completed":"error"}
        </span>
        {run&&<span className="ml-auto text-orange-400">● LIVE</span>}
        {done&&<span className="ml-auto text-emerald-400">✓ DONE</span>}
      </div>
      <div className="p-4 space-y-3">
        <div className="space-y-0.5">
          {phase==="idle"&&<p className={d?"text-slate-600":"text-amber-700/60"}>{">>"} {isEN?"Awaiting GAN training...":"GAN eğitimi bekleniyor..."}</p>}
          {(run||done)&&<>
            <p className={d?"text-slate-400":"text-amber-700"}>{">>"} {isEN?"GAN init: Generator(latent→patient) + Discriminator":"GAN başlatıldı: Generator(latent→hasta) + Discriminator"}</p>
            <p className={d?"text-slate-400":"text-amber-700"}>{">>"} {isEN?"Training data: GNN summaries + contextual factors":"Eğitim verisi: GNN özetleri + çevresel/yaşamsal faktörler"} ({trainResult?.n_records||"?"} {isEN?"records":"kayıt"})</p>
            {run&&<p className="text-orange-400">{">>"} epoch {epoch}/{maxEpoch} — G:{gLosses[gLosses.length-1]?.toFixed(5)??"..."}</p>}
            {done&&<p className="text-emerald-400">{">>"} {isEN?"Training complete!":"Eğitim tamamlandı!"} final_G={gl?.toFixed(6)}</p>}
          </>}
        </div>
        {(run||done)&&(
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {l:"final_G",  v:gl?.toFixed(6)??"—",                   c:"#f97316"},
              {l:"n_records",v:trainResult?.n_records??gLosses.length, c:"#38bdf8"},
              {l:"epochs",   v:`${epoch}/${maxEpoch}`,                c:"#a78bfa"},
              {l:"output_dim",v:trainResult?.output_dim??"—",         c:"#34d399"},
            ].map(({l,v,c})=>(
              <div key={l} className={`rounded-xl p-2 text-center border ${d?"border-slate-700 bg-slate-900":"border-amber-100 bg-white"}`}>
                <p className="text-xs font-bold" style={{color:c}}>{v}</p>
                <p className={`text-xs mt-0.5 ${d?"text-slate-600":"text-slate-400"}`}>{l}</p>
              </div>
            ))}
          </div>
        )}
        {gLosses.length>1&&<LossChart/>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GNN Kaynak Veri Paneli — GAN'ın eğitim verisi olan GNN hastaları
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// GAN v2 + GNN v2 Doğrulama Paneli
// ══════════════════════════════════════════════════════════════════════════════


// ── GAN v2 Faktör Özeti Paneli (açılır/kapanır) ──────────────────────────────
function GANFactorPanel({ dark, isEN }) {
  const d = dark;
  const [open, setOpen] = useState(false);

  const KOSE_REF = isEN
    ? "Köse, U., Ceylan, O., & Sürücü, E. B. (2026). A Unified Prognostic Data Architecture for Risk Stratification in Pediatric Acute Lymphoblastic Leukemia. 4th Cognitive Models and Artificial Intelligence Conference (April 24–25, 2026, Prague, Czech Republic), IEEE."
    : "Köse, U., Ceylan, O., & Sürücü, E. B. (2026). Pediatrik Akut Lenfoblastik Lösemide Risk Sınıflandırması için Birleşik Prognostik Veri Mimarisi. 4. Bilişsel Modeller ve Yapay Zeka Konferansı (24–25 Nisan 2026, Prag, Çek Cumhuriyeti), IEEE.";

  const RISK_NOTE = isEN
    ? "⚠ Important: Risk class here refers to the likelihood of treatment failure — i.e., the risk of relapse or insufficient response to treatment. LR = lowest risk of relapse (~95–98% event-free survival), VHR = highest risk of relapse (~30–60% EFS). This classification guides treatment intensity escalation."
    : "⚠ Önemli: Buradaki risk sınıfı, tedavi başarısızlığı olasılığını — yani hastalığın yinelemesi veya tedaviye yetersiz yanıt riskini — ifade eder. LR = en düşük yineleme riski (~%95–98 olaysız sağkalım), VHR = en yüksek yineleme riski (~%30–60 OAS). Bu sınıflandırma tedavi yoğunluğunun artırılmasında rehberlik eder.";

  const factors = [
    {icon:"👤", title:isEN?"Clinical-Demographic":"Klinik-Demografik",
     items:isEN
       ?["Age (1–17y) · Sex · Weight/Height/BSA","Baseline WBC/ANC · VitD · Diet · Exercise","ALL subtype (B-ALL 85% / T-ALL 15%) · CNS status"]
       :["Yaş (1–17y) · Cinsiyet · Kilo/Boy/BSA","Başlangıç WBC/ANC · VitD · Diyet · Egzersiz","ALL alt tipi (B-ALL %85 / T-ALL %15) · SSS durumu"]},
    {icon:"🧬", title:isEN?"Genomic Risk":"Genomik Risk",
     items:isEN
       ?["ETV6-RUNX1 (~25%) · High hyperdiploidy (~25%)","BCR-ABL1 (~4%) · Ph-like (~12%) · KMT2A-r (~5%)","IKZF1-del (~15%) · Hypodiploidy (~2%) · iAMP21 (~2%)","TCF3-HLF (~1%) · CDKN2AB-del (~20%)"]
       :["ETV6-RUNX1 (~%25) · Yüksek hiperdiploidi (~%25)","BCR-ABL1 (~%4) · Ph-like (~%12) · KMT2A-r (~%5)","IKZF1-del (~%15) · Hipodiploidi (~%2) · iAMP21 (~%2)","TCF3-HLF (~%1) · CDKN2AB-del (~%20)"]},
    {icon:"💊", title:isEN?"Pharmacogenomics":"Farmakogenetik",
     items:isEN
       ?["TPMT (normal 89% / intermediate 10% / poor 0.3%)","NUDT15-R139C (~4%, higher in Asian)","MTHFR-C677T (TT 12% / CT 38% / wt 50%)","CYP3A5*3 (~35%) · Anti-ASP antibody (~15%)"]
       :["TPMT (normal %89 / intermediate %10 / poor %0,3)","NUDT15-R139C (~%4, Asya'da daha yüksek)","MTHFR-C677T (TT %12 / CT %38 / wt %50)","CYP3A5*3 (~%35) · Anti-ASP antikoru (~%15)"]},
    {icon:"📊", title:isEN?"Treatment Response":"Tedavi Yanıtı",
     items:isEN
       ?["Day-8 steroid response (PGR/PPR)","Day-15 BM morphology (M1/M2/M3)","MRD D29 & EOC (ODE-derived proxy)","BRR_d8 · VIPN_min · Cumulative DNR"]
       :["G8 steroid yanıtı (PGR/PPR)","G15 kemik iliği morfolojisi (M1/M2/M3)","MRD G29 ve EOC (ODE türevli proxy)","BRR_d8 · VIPN_min · Kümülatif DNR"]},
    {icon:"🌍", title:isEN?"Sociodemographic":"Sosyodemografik",
     items:isEN
       ?["Ethnic group (Caucasian/Hispanic/Asian/African)","Socioeconomic index · Down syndrome (~2.5%)","Infection history (~10%) · Testicular involvement"]
       :["Etnik grup (Kafkas/Hispanik/Asya/Afrika)","Sosyoekonomik indeks · Down sendromu (~%2,5)","Enfeksiyon geçmişi (~%10) · Testis tutulumu"]},
    {icon:"🎯", title:isEN?"Risk Classification (Treatment Failure Risk)":"Risk Sınıflandırması (Tedavi Başarısızlığı Riski)",
     items:isEN
       ?["COG/BFM unified 5-class: LR · SR · IR · HR · VHR",
         "Score: MRD(30%)+Genomic(25%)+Day8(15%)+Day15BM(10%)+CNS(8%)+WBC(5%)+Immuno(4%)+SES(2%)+Infection(1%)",
         "Higher class = higher relapse risk = more intensive treatment needed"]
       :["COG/BFM birleşik 5 sınıf: LR · SR · IR · HR · VHR",
         "Skor: MRD(%30)+Genomik(%25)+G8(%15)+G15KİM(%10)+SSS(%8)+WBC(%5)+İmmüno(%4)+SES(%2)+Enf.(%1)",
         "Yüksek sınıf = yüksek yineleme riski = daha yoğun tedavi gereksinimi"]},
  ];

  return (
    <div className={`rounded-2xl border ${d?"bg-slate-900 border-amber-900/30":"bg-white border-amber-200 shadow-sm"}`}>
      {/* Başlık — tıklanabilir */}
      <button onClick={()=>setOpen(v=>!v)}
        className="w-full flex items-center justify-between p-5 text-left">
        <div>
          <p className={`text-sm font-semibold ${d?"text-slate-200":"text-slate-700"}`}>
            🧬 {isEN?"GAN v2 — Synthetic Profile Factors & Risk Explanation"
                    :"GAN v2 — Sentetik Profil Faktörleri & Risk Açıklaması"}
          </p>
          <p className={`text-xs mt-0.5 ${d?"text-slate-500":"text-slate-400"}`}>
            {isEN?"Click to view the factors used by GAN v2 and understand what risk class means."
                 :"GAN v2'nin kullandığı faktörleri görmek ve risk sınıfını anlamak için tıklayın."}
          </p>
        </div>
        <span className={`text-lg transition-transform ${open?"rotate-180":"rotate-0"} ${d?"text-amber-400":"text-amber-600"}`}>
          ▾
        </span>
      </button>

      {/* İçerik */}
      {open&&(
        <div className="px-5 pb-5 space-y-4">
          {/* Risk açıklaması — en üstte vurgulu */}
          <div className={`rounded-xl border p-3 ${d?"border-amber-500/30 bg-amber-500/10":"border-amber-300 bg-amber-50"}`}>
            <p className={`text-xs leading-relaxed ${d?"text-amber-300":"text-amber-800"}`}>
              {RISK_NOTE}
            </p>
          </div>

          <p className={`text-xs leading-relaxed ${d?"text-slate-400":"text-slate-600"}`}>
            {isEN
              ?"GAN v2 generates synthetic pediatric ALL patients by learning the joint distribution of the following factors from ODE-simulated cohort data. All factors are automatically assigned based on literature prevalences — no manual input required."
              :"GAN v2, ODE simülasyonu ile üretilmiş kohort verisinden aşağıdaki faktörlerin birleşik dağılımını öğrenerek sentetik pediatrik ALL hastaları üretir. Tüm faktörler literatür prevalanslarına göre otomatik atanır."}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {factors.map(({icon,title,items})=>(
              <div key={title} className={`rounded-xl border p-3 ${d?"border-slate-700 bg-slate-800/50":"border-amber-100 bg-amber-50/30"}`}>
                <p className={`text-xs font-bold mb-1.5 ${d?"text-amber-300":"text-amber-700"}`}>{icon} {title}</p>
                <ul className="space-y-0.5">
                  {items.map((item,i)=>(
                    <li key={i} className={`text-xs ${d?"text-slate-400":"text-slate-600"}`}>· {item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Tam künye */}
          <div className={`rounded-xl border p-3 ${d?"border-indigo-900/30 bg-indigo-500/5":"border-indigo-100 bg-indigo-50/30"}`}>
            <p className={`text-xs font-bold mb-1 ${d?"text-indigo-400":"text-indigo-700"}`}>
              📄 {isEN?"Citation":"Atıf"}
            </p>
            <p className={`text-xs italic leading-relaxed ${d?"text-slate-400":"text-slate-600"}`}>
              {KOSE_REF}
            </p>
            <p className={`text-xs mt-2 ${d?"text-slate-500":"text-slate-400"}`}>
              {isEN
                ?"Additional prevalence sources used in augmentation pipeline: Mullighan & Downing (Nat. Rev. Cancer, 2012) · Lennard (Pharmacogenomics, 2014) · Pui & Howard (Lancet Oncol., 2008)."
                :"Augmentasyon pipeline'ında kullanılan ek prevalans kaynakları: Mullighan & Downing (Nat. Rev. Cancer, 2012) · Lennard (Pharmacogenomics, 2014) · Pui & Howard (Lancet Oncol., 2008)."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── GAN v2 Eğitim Paneli ─────────────────────────────────────────────────────
function GANTrainingPanel({ dark, isEN, onModelTrained }) {
  const d = dark;
  const [status,     setStatus]     = useState(null);
  const [gaPoolCount,setGaPoolCount]= useState(0);
  const [ganRecords, setGanRecords] = useState([]);   // GAN pool kayıtları
  const [loading,    setLoading]    = useState(false);
  const [converting, setConverting] = useState(false);
  const [adding,     setAdding]     = useState(false);
  const [nExtra,     setNExtra]     = useState(10);
  const [extraSeed,  setExtraSeed]  = useState(99);
  const [excluded,   setExcluded]   = useState(new Set());
  const [epochs,     setEpochs]     = useState(300);
  const [batchSize,  setBatchSize]  = useState(500);
  const [phase,      setPhase]      = useState("idle");
  const [epoch,      setEpoch]      = useState(0);
  const [gLosses,    setGLosses]    = useState([]);
  const [dLosses,    setDLosses]    = useState([]);
  const [trainResult,setTrainResult]= useState(null);
  const [csvStatus,  setCsvStatus]  = useState(null); // {status, progress, n_total, n_done}
  const [error,      setError]      = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [st, pool] = await Promise.all([
        apiGet("/gan/v2/training/status"),
        apiGet("/gan/v2/training/pool"),
      ]);
      setStatus(st);
      setGaPoolCount(st.ga_pool_count || 0);
      setGanRecords(pool.records || []);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ refresh(); },[]);

  const sdvReady  = status?.sdv_available;
  const ganTotal  = ganRecords.length;
  const activeCount = ganTotal - excluded.size;

  // GA pool'dan dönüştür
  const handleConvert = async () => {
    setConverting(true); setError(null);
    try {
      const res = await apiPost("/gan/v2/training/convert-ga-pool", { seed: 42 });
      setGanRecords(prev => [...prev, ...(res.records||[])]);
      if(res.skipped > 0) {
        setError(`${res.converted} kayıt dönüştürüldü, ${res.skipped} kayıt atlandı (zaman serisi eksik).`);
      }
    } catch(e) { setError(e.message); }
    finally { setConverting(false); }
  };

  // Sentetik profil ekle
  const handleAddSynthetic = async () => {
    if(nExtra < 1) return;
    setAdding(true); setError(null);
    try {
      const res = await apiPost("/gan/v2/training/add-synthetic",
        { n_patients: nExtra, seed: extraSeed });
      setGanRecords(prev => [...prev, ...(res.records||[])]);
    } catch(e) { setError(e.message); }
    finally { setAdding(false); }
  };

  // GAN pool'dan sil
  const handleDelete = async (rid) => {
    if(!window.confirm(isEN?"Delete this record from GAN pool?":"Bu kaydı GAN pool'dan sil?")) return;
    try {
      await api(`/gan/v2/training/pool/${rid}`, {method:"DELETE"});
      setGanRecords(prev => prev.filter(r => r.record_id !== rid));
      setExcluded(prev => { const n=new Set(prev); n.delete(rid); return n; });
    } catch(e) { setError(e.message); }
  };

  // Eğitimi durdur
  const handleStop = () => {
    setPhase("idle");
    setEpoch(0);
    setGLosses([]);
    setDLosses([]);
    setError(isEN?"Training cancelled.":"Eğitim iptal edildi.");
  };

  // GAN eğit — animasyon için simüle progress
  const handleTrain = async () => {
    if(activeCount < 10) {
      setError(isEN?`Not enough records (${activeCount}). Min 10 needed.`
                   :`Yetersiz kayıt (${activeCount}). Min 10 gerekli.`);
      return;
    }
    setPhase("training"); setError(null); setTrainResult(null);
    setGLosses([]); setDLosses([]); setEpoch(0);

    // Simüle progress — gerçek süreye yakın zamanlama
    // SDV ~0.6s/epoch, progress MAX %90'a kadar gider, gerçek sonuç gelince %100
    const estDurationMs = epochs * 650; // ~0.65s/epoch tahmini
    const nSteps = 50; // toplam adım sayısı sabit
    const intervalMs = Math.max(400, estDurationMs / nSteps);
    const stepSize = Math.max(1, Math.floor(epochs * 0.9 / nSteps)); // max %90

    const fakeInterval = setInterval(()=>{
      setEpoch(e => {
        const maxFake = Math.floor(epochs * 0.90); // %90'da dur
        const next = e + stepSize;
        if(next >= maxFake) {
          clearInterval(fakeInterval);
          return maxFake; // %90'da bekle, gerçek sonuç gelince 100'e çık
        }
        setGLosses(g => {
          const last = g.length>0?g[g.length-1]:1.2;
          return [...g, Math.max(0.08, last * (0.93 + Math.random()*0.05))];
        });
        setDLosses(d => {
          const last = d.length>0?d[d.length-1]:0.8;
          return [...d, Math.max(0.04, last * (0.95 + Math.random()*0.06))];
        });
        return next;
      });
    }, intervalMs);

    try {
      const res = await apiPost("/gan/v2/training/train", {
        excluded_ids: [...excluded], epochs, batch_size: batchSize,
      });
      clearInterval(fakeInterval);
      setEpoch(epochs);
      setGLosses(g => [...g, res.final_g_loss||0.1]);
      setDLosses(d => [...d, res.final_d_loss||0.05]);
      setTrainResult(res); setPhase("done");
      if(onModelTrained) onModelTrained(res);
      // CSV polling başlat
      setCsvStatus({status:"pending", progress:0});
      const pollCsv = setInterval(async () => {
        try {
          const csvSt = await apiGet(`/gan/v2/training/csv-status/${res.job_id}`);
          setCsvStatus(csvSt);
          if(csvSt.status === "done" || csvSt.status === "error") {
            clearInterval(pollCsv);
          }
        } catch { clearInterval(pollCsv); }
      }, 3000);
    } catch(e) {
      clearInterval(fakeInterval);
      setError(e.message); setPhase("error");
    }
  };

  const handleDownload = async () => {
    if(!trainResult?.job_id) return;
    await handleDownloadById(trainResult.job_id, "pkl");
  };

  const handleDownloadCSV = async () => {
    if(!trainResult?.job_id) return;
    await handleDownloadById(trainResult.job_id, "csv");
  };

  const handleDownloadById = async (jobId, type) => {
    try {
      const endpoint = type === "csv"
        ? `/api/v1/gan/v2/training/download-csv/${jobId}`
        : `/api/v1/gan/v2/training/download-model/${jobId}`;
      const filename = type === "csv"
        ? `synthetic_${jobId.slice(0,8)}.csv`
        : `ctgan_${jobId.slice(0,8)}.pkl`;
      const res = await fetch(endpoint,
        {headers:{Authorization:`Bearer ${localStorage.getItem("sting_token")}`}});
      if(!res.ok) throw new Error(`${type.toUpperCase()} indirme başarısız`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = filename;
      a.click(); URL.revokeObjectURL(url);
    } catch(e) { setError(e.message); }
  };

  const RISK_COLS = {LR:"#10b981",SR:"#34d399",IR:"#f59e0b",HR:"#ef4444",VHR:"#7c3aed"};
  const GEN_LABELS = {
    "gen_etv6_runx1":"ETV6-RUNX1","gen_bcr_abl1":"BCR-ABL1",
    "gen_high_hyperdip":"Hiperdip.","gen_hypodiploidy":"Hipodip.",
    "gen_ph_like":"Ph-like","gen_ikzf1_del":"IKZF1-del",
  };

  const card = `rounded-2xl border p-5 ${d?"bg-slate-900 border-slate-700":"bg-white border-amber-100 shadow-sm"}`;

  return (
    <div className="space-y-4">

      {/* Durum */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <p className={`text-sm font-semibold ${d?"text-slate-200":"text-slate-700"}`}>
            📊 {isEN?"GAN Training Pool Status":"GAN Eğitim Havuzu Durumu"}
          </p>
          <button onClick={refresh} disabled={loading}
            className={`text-xs px-3 py-1 rounded-lg border ${d?"border-slate-700 text-slate-400":"border-slate-200 text-slate-500"}`}>
            {loading?"…":"↺"}
          </button>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {[
            ["SDV", sdvReady?"✓ Kurulu":"✗ Eksik", sdvReady?"#10b981":"#ef4444"],
            [isEN?"GA Pool":"GA Pool", gaPoolCount, "#6366f1"],
            [isEN?"GAN Pool":"GAN Pool", ganTotal, "#f97316"],
            [isEN?"Active":"Aktif", activeCount, "#10b981"],
          ].map(([l,v,c])=>(
            <div key={l} className={`rounded-xl px-3 py-2 ${d?"bg-slate-800":"bg-slate-50"}`}>
              <p className={`${d?"text-slate-400":"text-slate-500"}`}>{l}</p>
              <p className="font-bold" style={{color:c}}>{v}</p>
            </div>
          ))}
        </div>
        {!sdvReady&&(
          <p className={`mt-2 text-xs ${d?"text-amber-400":"text-amber-600"}`}>
            ⚠ requirements.txt'e 'sdv==1.12.1' ekleyin ve Docker rebuild yapın.
          </p>
        )}
      </div>

      {/* Adım 1: GA Pool'dan dönüştür */}
      <div className={card}>
        <p className={`text-sm font-semibold mb-1 ${d?"text-slate-200":"text-slate-700"}`}>
          1️⃣ {isEN?"Convert GA Pool → GAN Pool":"GA Pool'dan GAN Pool'a Dönüştür"}
        </p>
        <p className={`text-xs mb-3 ${d?"text-slate-500":"text-slate-400"}`}>
          {isEN
            ?"Tab 4 GA optimization results are read-only converted to GAN format by adding genetic, pharmacogenomic and clinical response factors. GA pool is NOT modified."
            :"Tab 4 GA optimizasyon sonuçları salt okunur biçimde genetik, farmakogenetik ve klinik yanıt faktörleri eklenerek GAN formatına dönüştürülür. GA pool'a DOKUNULMAZ."}
        </p>
        <button onClick={handleConvert} disabled={converting||!sdvReady||gaPoolCount===0}
          className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all ${
            converting?"bg-amber-400 opacity-60 cursor-not-allowed"
            :gaPoolCount===0?"opacity-40 cursor-not-allowed bg-slate-600"
            :"bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400"}`}>
          {converting?"Dönüştürülüyor…"
            :isEN?`▶ Convert ${gaPoolCount} GA Records`:`▶ ${gaPoolCount} GA Kaydını Dönüştür`}
        </button>
        {gaPoolCount===0&&(
          <p className={`mt-2 text-xs ${d?"text-amber-400":"text-amber-600"}`}>
            ⚠ {isEN?"No GA optimization records. Run GA in Tab 4 first.":"GA optimizasyon kaydı yok. Önce Tab 4'te GA çalıştırın."}
          </p>
        )}
      </div>

      {/* Adım 2: Sentetik profil ekle */}
      <div className={card}>
        <p className={`text-sm font-semibold mb-1 ${d?"text-slate-200":"text-slate-700"}`}>
          2️⃣ {isEN?"Add Synthetic Profiles (optional)":"Sentetik Profil Ekle (isteğe bağlı)"}
        </p>
        <p className={`text-xs mb-3 ${d?"text-slate-500":"text-slate-400"}`}>
          {isEN
            ?"Generate additional synthetic patient profiles using literature-based distributions and add them to the GAN pool."
            :"Literatür dağılımlarından ek sentetik hasta profilleri üretin ve GAN pool'a ekleyin."}
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className={`text-xs block mb-1 ${d?"text-slate-400":"text-slate-600"}`}>
              {isEN?"Number of profiles:":"Profil sayısı:"}
            </label>
            <input type="number" min={1} max={500} step={10} value={nExtra}
              onChange={e=>setNExtra(Math.max(1,+e.target.value))}
              className={`w-24 border rounded-xl px-2 py-1.5 text-sm ${d?"bg-slate-800 border-slate-700 text-slate-200":"bg-white border-amber-200"}`}/>
          </div>
          <div>
            <label className={`text-xs block mb-1 ${d?"text-slate-400":"text-slate-600"}`}>
              {isEN?"Seed (reproducibility):":"Seed (tekrarlanabilirlik):"}
            </label>
            <input type="number" value={extraSeed} onChange={e=>setExtraSeed(+e.target.value)}
              className={`w-20 border rounded-xl px-2 py-1.5 text-sm ${d?"bg-slate-800 border-slate-700 text-slate-200":"bg-white border-amber-200"}`}/>
          </div>
          <button onClick={handleAddSynthetic} disabled={adding||!sdvReady}
            className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all ${
              adding?"bg-indigo-400 opacity-60 cursor-not-allowed"
              :"bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500"}`}>
            {adding?"Ekleniyor…":isEN?`+ Add ${nExtra} Profiles`:`+ ${nExtra} Profil Ekle`}
          </button>
        </div>
      </div>

      {/* GAN Pool Listesi */}
      {ganRecords.length>0&&(
        <div className={card}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-sm font-semibold ${d?"text-slate-200":"text-slate-700"}`}>
              📋 {isEN?"GAN Pool Records":"GAN Pool Kayıtları"}
              <span className={`ml-2 text-xs font-normal ${d?"text-slate-400":"text-slate-500"}`}>
                ({ganTotal} {isEN?"total":"toplam"} · {activeCount} {isEN?"active":"aktif"})
              </span>
            </p>
          </div>
          {excluded.size>0&&(
            <p className={`text-xs mb-2 ${d?"text-amber-400":"text-amber-600"}`}>
              {excluded.size} {isEN?"records excluded from training":"kayıt eğitim dışı"}
            </p>
          )}
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {ganRecords.map((rec,i)=>{
              const rid    = rec.record_id;
              const isExcl = excluded.has(rid);
              const isSynth= rec.source === "synthetic";
              const rc     = rec.risk_class || "IR";
              const rcCol  = RISK_COLS[rc] || "#6366f1";

              // Aktif genetik varyantlar
              const activeGens = Object.entries(GEN_LABELS)
                .filter(([k])=>rec[k])
                .map(([,v])=>v);

              return (
                <div key={rid} className={`rounded-xl border px-3 py-2.5 text-xs transition-all ${
                  isExcl
                    ?(d?"bg-slate-800/40 border-slate-700 opacity-50":"bg-slate-50 border-slate-200 opacity-50")
                    :(d?"bg-slate-800 border-slate-700":"bg-white border-slate-200")}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Satır 1: kaynak + risk + yaş/cinsiyet */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded font-semibold ${
                          isSynth
                            ?(d?"bg-indigo-500/20 text-indigo-300":"bg-indigo-100 text-indigo-600")
                            :(d?"bg-amber-500/20 text-amber-400":"bg-amber-100 text-amber-700")}`}>
                          {isSynth?(isEN?"synth":"sentetik"):"GA→aug"}
                        </span>
                        <span className="font-bold px-1.5 py-0.5 rounded" style={{
                          background:`${rcCol}20`, color:rcCol}}>
                          {rc}
                        </span>
                        <span className={d?"text-slate-300":"text-slate-600"}>
                          {rec.age}{isEN?"y":"y"} · {rec.sex==="F"?"♀":"♂"}
                        </span>
                        <span className={d?"text-slate-400":"text-slate-500"}>
                          {rec.pat_all_subtype||"B-ALL"} · {rec.pat_cns_status||"CNS1"}
                        </span>
                        <span className={d?"text-slate-500":"text-slate-400"}>
                          TPMT:{rec.phg_tpmt_status||"normal"}
                        </span>
                      </div>
                      {/* Satır 2: klinik değerler */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={d?"text-slate-400":"text-slate-500"}>
                          WBC:{rec.pat_wbc_diag?.toFixed(1)} VitD:{rec.vitamin_d?.toFixed(0)}
                        </span>
                        {rec._brr_d8&&(
                          <span className={`font-mono ${rec._brr_d8>0.90?"text-emerald-400":"text-amber-400"}`}>
                            BRR:{(rec._brr_d8*100).toFixed(1)}%
                          </span>
                        )}
                        {rec._mrd_d29_pct!=null&&(
                          <span className={`font-mono ${rec._mrd_d29_pct<0.01?"text-emerald-400":rec._mrd_d29_pct<0.1?"text-amber-400":"text-red-400"}`}>
                            MRD:{rec._mrd_d29_pct?.toFixed(3)}%
                          </span>
                        )}
                      </div>
                      {/* Satır 3: aktif genetik varyantlar */}
                      {activeGens.length>0&&(
                        <div className="flex gap-1 flex-wrap">
                          {activeGens.map(g=>(
                            <span key={g} className={`px-1 py-0.5 rounded text-xs ${d?"bg-violet-500/20 text-violet-300":"bg-violet-100 text-violet-700"}`}>
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Butonlar */}
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={()=>setExcluded(prev=>{
                        const n=new Set(prev); n.has(rid)?n.delete(rid):n.add(rid); return n;
                      })} className={`text-xs px-2 py-1 rounded-lg border font-medium ${
                        isExcl
                          ?(d?"bg-indigo-500/20 text-indigo-300 border-indigo-500/30":"bg-indigo-50 text-indigo-600 border-indigo-200")
                          :(d?"bg-slate-700 text-slate-400 border-slate-600":"bg-slate-50 text-slate-500 border-slate-200")}`}>
                        {isExcl?(isEN?"Include":"Dahil"):(isEN?"Exclude":"Dışla")}
                      </button>
                      <button onClick={()=>handleDelete(rid)}
                        className={`text-xs px-2 py-1 rounded-lg border ${
                          d?"text-red-400 border-red-900/30 hover:bg-red-500/10":"text-red-600 border-red-200 hover:bg-red-50"}`}>
                        {isEN?"Del":"Sil"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Adım 3: Eğit */}
      <div className={card}>
        <p className={`text-sm font-semibold mb-3 ${d?"text-slate-200":"text-slate-700"}`}>
          3️⃣ {isEN?"Train GAN Model":"GAN Modeli Eğit"}
        </p>

        {/* GAN Animasyon */}
        <GANArchViz dark={d} phase={phase} epoch={epoch}
          maxEpoch={epochs}
          gLoss={gLosses.length>0?gLosses[gLosses.length-1]:null}
          dLoss={dLosses.length>0?dLosses[dLosses.length-1]:null}/>

        <div className="flex items-end gap-3 flex-wrap mb-3 mt-3">
          {/* Uyarı notu */}
          <div className={`w-full text-xs rounded-lg px-3 py-1.5 ${d?"bg-amber-500/10 text-amber-400 border border-amber-500/20":"bg-amber-50 text-amber-700 border border-amber-200"}`}>
            ⚠ {isEN
              ?"Changing parameters beyond defaults may deviate from the validated model behavior."
              :"Varsayılan parametrelerin dışına çıkmak, doğrulanmış model davranışından sapmanıza yol açabilir."}
          </div>
          <div>
            <label className={`text-xs block mb-1 ${d?"text-slate-400":"text-slate-600"}`}>Epoch</label>
            <select value={epochs} onChange={e=>setEpochs(+e.target.value)}
              className={`border rounded-xl px-2 py-1.5 text-sm ${d?"bg-slate-800 border-slate-700 text-slate-200":"bg-white border-amber-200"}`}>
              {[100,200,300,500].map(v=><option key={v} value={v}>{v}{v===300?" ✓":""}</option>)}
            </select>
          </div>
          <div>
            <label className={`text-xs block mb-1 ${d?"text-slate-400":"text-slate-600"}`}>Batch Size</label>
            <select value={batchSize} onChange={e=>setBatchSize(+e.target.value)}
              className={`border rounded-xl px-2 py-1.5 text-sm ${d?"bg-slate-800 border-slate-700 text-slate-200":"bg-white border-amber-200"}`}>
              {[128,256,500,1000].map(v=><option key={v} value={v}>{v}{v===500?" ✓":""}</option>)}
            </select>
          </div>
          <button onClick={phase==="training"?handleStop:handleTrain}
            disabled={phase!=="training"&&(activeCount<10||!sdvReady)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all ${
              phase==="training"?"bg-red-500 hover:bg-red-400"
              :activeCount<10||!sdvReady?"opacity-40 cursor-not-allowed bg-slate-600"
              :"bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500"}`}>
            {phase==="training"
              ?(isEN?"■ Stop":"■ Durdur")
              :phase==="done"?(isEN?"↺ Retrain":"↺ Yeniden Eğit")
              :isEN?`▶ Train (${activeCount} records)`:`▶ Eğit (${activeCount} kayıt)`}
          </button>
        </div>

        {/* GAN Konsol */}
        {phase!=="idle"&&(
          <div className="mt-3">
            <GANConsole dark={d} phase={phase} epoch={epoch} maxEpoch={epochs}
              gLosses={gLosses} dLosses={dLosses} trainResult={trainResult} isEN={isEN}/>
          </div>
        )}

        {/* Eğitim sonucu — sadece mevcut session */}
        {trainResult&&phase==="done"&&(
          <div className="space-y-2 mt-3">
            {/* Özet */}
            <div className={`rounded-xl px-3 py-2 text-xs ${d?"bg-emerald-500/10 border border-emerald-500/20 text-emerald-300":"bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
              ✓ {isEN?"Training completed":"Eğitim tamamlandı"} · {trainResult.n_records} {isEN?"records":"kayıt"} · {trainResult.epochs} epoch ·{" "}
              {Object.entries(trainResult.risk_dist||{}).map(([k,v])=>(
                <span key={k} className="mr-1" style={{color:RISK_COLS[k]||"#6366f1"}}>{k}:{v}</span>
              ))}
            </div>

            {/* CSV progress */}
            {csvStatus&&csvStatus.status!=="done"&&(
              <div className={`rounded-xl px-3 py-2 text-xs ${d?"bg-slate-800 border border-slate-700":"bg-slate-50 border border-slate-200"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-semibold flex items-center gap-1.5 ${d?"text-teal-300":"text-teal-700"}`}>
                    <span className="animate-spin inline-block">⟳</span>
                    {isEN?"Building reference CSV (ODE simulation)...":"Referans CSV üretiliyor (ODE simülasyonu)..."}
                  </span>
                  <span className={d?"text-slate-400":"text-slate-500"}>
                    {csvStatus.n_done||0}/{csvStatus.n_total||500}
                  </span>
                </div>
                <div className={`w-full rounded-full h-1.5 ${d?"bg-slate-700":"bg-slate-200"}`}>
                  <div className="h-1.5 rounded-full bg-teal-500 transition-all"
                    style={{width:`${csvStatus.progress||0}%`}}/>
                </div>
              </div>
            )}

            {/* Sonraki adımlar */}
            <div className={`rounded-xl px-3 py-2 text-xs space-y-0.5 ${d?"bg-indigo-500/10 border border-indigo-500/20 text-indigo-300":"bg-indigo-50 border border-indigo-200 text-indigo-700"}`}>
              <p className="font-semibold">💡 {isEN?"Next steps:":"Sonraki adımlar:"}</p>
              <p>1. {isEN?"Download PKL and CSV (when ready)":"PKL ve CSV'yi indirin (CSV hazır olunca)"}</p>
              <p>2. {isEN?"Go to 'Use Pre-trained Model' tab":"'Hazır Modeli Kullan' sekmesine geçin"}</p>
              <p>3. {isEN?"Upload both files":"İki dosyayı da yükleyin"}</p>
            </div>

            {/* İndirme butonları */}
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleDownload}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  d?"bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 hover:bg-indigo-500/30"
                   :"bg-indigo-100 text-indigo-700 border border-indigo-300 hover:bg-indigo-200"}`}>
                ⬇ {isEN?"Download Model (.pkl)":"Modeli İndir (.pkl)"}
              </button>
              {csvStatus?.status==="done"
                ? <button onClick={handleDownloadCSV}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      d?"bg-teal-500/20 text-teal-200 border border-teal-500/30 hover:bg-teal-500/30"
                       :"bg-teal-100 text-teal-700 border border-teal-300 hover:bg-teal-200"}`}>
                    ⬇ {isEN?"Download Reference CSV":"Referans CSV İndir"}
                  </button>
                : <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs ${
                    d?"bg-slate-700 text-slate-500 border border-slate-600"
                     :"bg-slate-100 text-slate-400 border border-slate-200"}`}>
                    ⏳ {isEN?"CSV not ready yet":"CSV henüz hazır değil"}
                  </div>
              }
            </div>
          </div>
        )}

        {error&&<p className={`mt-2 text-xs ${d?"text-amber-400":"text-amber-600"}`}>ℹ {error}</p>}
      </div>
    </div>
  );
}


function GANv2Panel({ dark, isEN, onCohortReady }) {
  const d = dark;
  const [status,       setStatus]       = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [nPatients,    setNPatients]    = useState(20);
  const [seed,         setSeed]         = useState(42);
  const [genStatus,    setGenStatus]    = useState("idle");
  const [jobId,        setJobId]        = useState(null);
  const [cohort,       setCohort]       = useState(null);
  const [valStatus,    setValStatus]    = useState("idle");
  const [valResult,    setValResult]    = useState(null);
  const [fullCohort,   setFullCohort]   = useState(null);
  const [error,        setError]        = useState(null);

  // Otomatik adım akışı: bağlan → üret → doğrula
  const [step, setStep] = useState("idle");
  const [stepMsg, setStepMsg] = useState("");
  const [customModel, setCustomModel] = useState(null); // yüklenen özel model adı

  useEffect(()=>{
    apiGet("/gan/v2/status").then(setStatus).catch(()=>{});
  },[]);

  const handleGenerate = async () => {
    setStep("connecting"); setError(null); setCohort(null);
    setJobId(null); setValResult(null); setFullCohort(null);
    try {
      // Adım 1: GNN bağlantısı kur
      setStepMsg("GNN v2 bağlantısı kuruluyor…");
      const st = await apiGet("/gan/v2/status");
      setStatus(st);
      if(st.status !== "ready") throw new Error("GAN modeli hazır değil.");

      // Adım 2: Hasta üret
      setStep("generating");
      setStepMsg(`${nPatients} sentetik hasta üretiliyor…`);
      const res = await apiPost("/gan/v2/generate", { n_patients: nPatients, seed });
      setJobId(res.job_id); setCohort(res);

      // Adım 3: GNN v2 doğrula
      setStep("validating");
      setStepMsg("GNN v2 ile trajektori doğrulanıyor…");
      const val = await apiPost("/gan/v2/validate", { gan_v2_job_id: res.job_id, n_days: 250 });
      setValResult(val);

      // Adım 4: Tam kohortu çek
      const full = await apiGet(`/gan/v2/cohort/${res.job_id}`);
      const patients = (full.patients||[]).map(p => _ganV2ToPatient(p));
      setFullCohort(patients);
      if (onCohortReady) onCohortReady(patients, res.job_id);

      setStep("done");
      setStepMsg("");
    } catch(e) {
      setError(e.message); setStep("error"); setStepMsg("");
    }
  };

  const ready     = status?.status === "ready";
  const notFound  = status?.status === "model_not_found";
  const riskColors = { lr:"#10b981", sr:"#34d399", ir:"#f59e0b", hr:"#ef4444", vhr:"#7c3aed" };
  const riskLabels = { lr:"LR", sr:"SR", ir:"IR", hr:"HR", vhr:"VHR" };

  const STEPS = [
    {id:"connecting", label:isEN?"Connecting to GNN v2…":"GNN v2 bağlantısı kuruluyor…", icon:"🔗"},
    {id:"generating", label:isEN?`Generating ${nPatients} patients…`:`${nPatients} hasta üretiliyor…`, icon:"🧬"},
    {id:"validating", label:isEN?"Validating with GNN v2…":"GNN v2 doğrulanıyor…", icon:"🤖"},
    {id:"done",       label:isEN?"Complete!":"Tamamlandı!", icon:"✓"},
  ];
  const stepIdx = STEPS.findIndex(s=>s.id===step);
  const running = ["connecting","generating","validating"].includes(step);

  const card2 = d
    ? "bg-slate-800/60 border border-amber-900/30 rounded-2xl"
    : "bg-white border border-amber-200 rounded-2xl shadow-sm";

  return (
    <div className={card2 + " p-5"}>
      {/* Model durum bilgisi + upload */}
      {status&&(
        <div className={`rounded-xl border p-3 mb-4 ${
          status.status==="ready"
            ?(d?"border-emerald-500/30 bg-emerald-500/5":"border-emerald-200 bg-emerald-50")
            :(d?"border-amber-500/30 bg-amber-500/5":"border-amber-200 bg-amber-50")}`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className={`text-xs font-semibold ${status.status==="ready"?(d?"text-emerald-300":"text-emerald-700"):(d?"text-amber-300":"text-amber-700")}`}>
                {status.status==="ready"
                  ?(isEN
                    ?`✓ Model loaded (${customModel||status.active_model||"ctgan_drug10.pkl"})`
                    :`✓ Model yüklü (${customModel||status.active_model||"ctgan_drug10.pkl"})`)
                  :(isEN?"⚠ Model not found":"⚠ Model bulunamadı")}
              </p>
              {status.status==="ready"&&(
                <p className={`text-xs mt-0.5 ${d?"text-slate-400":"text-slate-500"}`}>
                  {status.model_type==="pkl"
                    ?(isEN?"SDV CTGAN model · sample() generation":"SDV CTGAN modeli · sample() üretimi")
                    :(isEN?"CSV cohort fallback · direct sampling":"CSV kohort fallback · doğrudan örnekleme")}
                  {" · "}{isEN?"5 risk classes · GNN v2 validated":"5 risk sınıfı · GNN v2 doğrulamalı"}
                </p>
              )}
            </div>
            {/* Model + CSV upload paneli */}
            <div className="flex flex-col gap-2 items-end min-w-[200px]">

              {/* Varsayılan dosyalar bilgisi */}
              <div className={`w-full rounded-lg px-3 py-2 border text-xs ${d?"bg-slate-800 border-slate-700 text-slate-400":"bg-slate-50 border-slate-200 text-slate-500"}`}>
                <p className="font-semibold mb-1">{isEN?"Default files:":"Varsayılan dosyalar:"}</p>
                <p>📦 ctgan_drug10.pkl</p>
                <p>📄 synthetic_drug10.csv</p>
              </div>

              {/* PKL yükleme */}
              <input type="file" accept=".pkl" id="gan-model-upload" className="hidden"
                onChange={async e=>{
                  const file=e.target.files?.[0]; if(!file) return;
                  const fd=new FormData(); fd.append("file",file);
                  try {
                    const res=await fetch("/api/v1/gan/v2/upload-model",
                      {method:"POST",headers:{Authorization:`Bearer ${localStorage.getItem("sting_token")}`},body:fd});
                    const text=await res.text();
                    let d2={};
                    try { d2=JSON.parse(text); } catch {}
                    if(!res.ok) throw new Error(d2.detail||text||"Yükleme hatası");
                    setStatus(await apiGet("/gan/v2/status"));
                    setCustomModel(file.name);
                  } catch(e){ setError(e.message); }
                  e.target.value="";
                }}/>
              <label htmlFor="gan-model-upload"
                className={`w-full text-center cursor-pointer text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                  d?"bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30"
                   :"bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"}`}>
                📦 {isEN?"Upload Model (.pkl)":"Model Yükle (.pkl)"}
              </label>

              {/* CSV yükleme */}
              <input type="file" accept=".csv" id="gan-csv-upload" className="hidden"
                onChange={async e=>{
                  const file=e.target.files?.[0]; if(!file) return;
                  const fd=new FormData(); fd.append("file",file);
                  try {
                    const res=await fetch("/api/v1/gan/v2/upload-csv",
                      {method:"POST",headers:{Authorization:`Bearer ${localStorage.getItem("sting_token")}`},body:fd});
                    const text=await res.text();
                    let d2={};
                    try { d2=JSON.parse(text); } catch {}
                    if(!res.ok) throw new Error(d2.detail||text||"CSV yükleme hatası");
                    setStatus(await apiGet("/gan/v2/status"));
                    alert(d2.message||(isEN?"CSV uploaded.":"CSV yüklendi."));
                  } catch(e){ setError(e.message); }
                  e.target.value="";
                }}/>
              <label htmlFor="gan-csv-upload"
                className={`w-full text-center cursor-pointer text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                  d?"bg-teal-500/20 text-teal-300 border-teal-500/30 hover:bg-teal-500/30"
                   :"bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"}`}>
                📄 {isEN?"Upload Reference CSV":"Referans CSV Yükle"}
              </label>

              {/* Varsayılana dön — hem PKL hem CSV */}
              <button onClick={async()=>{
                try {
                  const res = await apiPost("/gan/v2/reset-to-default", {});
                  setStatus(await apiGet("/gan/v2/status"));
                  setCustomModel(null);
                  setError(null);
                  alert(res.message||
                    (isEN?"Default model and CSV restored.":"Varsayılan model ve CSV geri yüklendi."));
                } catch(e){ setError(e.message); }
              }} className={`w-full text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                d?"bg-slate-700 text-slate-300 border-slate-600 hover:border-slate-500"
                 :"bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"}`}>
                ↩ {isEN?"Restore Defaults (PKL + CSV)":"Varsayılana Dön (PKL + CSV)"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className={`text-sm font-semibold ${d?"text-slate-200":"text-slate-700"}`}>
            🧬 {isEN?"GAN v2 Synthetic Patient Generation":"GAN v2 Sentetik Hasta Üretimi"}
          </p>
          <p className={`text-xs mt-0.5 ${d?"text-slate-500":"text-slate-400"}`}>
            {isEN?"Pre-built model · 5 risk classes · GNN v2 auto-validation"
                 :"Hazır model · 5 risk sınıfı · GNN v2 otomatik doğrulama"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className={`text-xs ${d?"text-slate-400":"text-slate-600"}`}>{isEN?"Patients:":"Hasta:"}</label>
            <input type="number" min={5} max={200} value={nPatients}
              onChange={e=>setNPatients(parseInt(e.target.value)||20)}
              className={`w-16 text-xs px-2 py-1 rounded-lg border ${d?"bg-slate-700 border-slate-600 text-slate-200":"bg-white border-slate-300 text-slate-700"}`}/>
          </div>
          <div className="flex items-center gap-1.5" title={isEN?"Seed: same number = same patients. Change to get different patients.":"Seed: aynı sayı = aynı hastalar. Farklı hastalar için değiştirin."}>
            <label className={`text-xs ${d?"text-slate-400":"text-slate-600"}`}>
              {isEN?"Seed (reproducibility)":"Seed (tekrarlanabilirlik)"}
            </label>
            <input type="number" value={seed} onChange={e=>setSeed(parseInt(e.target.value)||42)}
              className={`w-20 text-xs px-2 py-1 rounded-lg border ${d?"bg-slate-700 border-slate-600 text-slate-200":"bg-white border-slate-300 text-slate-700"}`}/>
          </div>
          <button onClick={handleGenerate} disabled={running}
            className={`text-xs px-4 py-2 rounded-xl font-semibold text-white transition-all ${
              running?"bg-amber-400 opacity-60 cursor-not-allowed"
              :"bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400"}`}>
            {running?"…":step==="done"?(isEN?"↺ Re-generate":"↺ Yeniden"):(isEN?"▶ Generate":"▶ Üret")}
          </button>
        </div>
      </div>

      {/* Adım göstergesi */}
      {step!=="idle"&&(
        <div className="mb-4">
          <div className="flex items-center mb-2">
            {STEPS.map((s,i)=>{
              const done2  = stepIdx > i || step==="done";
              const active = stepIdx === i && step!=="done";
              return (
                <div key={s.id} className="flex items-center flex-1 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 ${
                    done2||active
                      ?(d?"bg-amber-500/20 border-amber-500":"bg-amber-100 border-amber-500")
                      :(d?"bg-slate-800 border-slate-700":"bg-slate-100 border-slate-300")}`}>
                    {done2&&!active?"✓":s.icon}
                  </div>
                  {i<STEPS.length-1&&(
                    <div className={`flex-1 h-0.5 mx-1 ${done2?(d?"bg-amber-500":"bg-amber-400"):(d?"bg-slate-700":"bg-slate-200")}`}/>
                  )}
                </div>
              );
            })}
          </div>
          {running&&stepMsg&&(
            <p className={`text-xs ${d?"text-amber-400":"text-amber-600"}`}>{stepMsg}</p>
          )}
        </div>
      )}

      {/* Sonuç */}
      {step==="done"&&cohort&&(
        <div className="space-y-2">
          <div className={`rounded-xl px-3 py-2 text-xs ${d?"bg-emerald-500/10 border border-emerald-500/20":"bg-emerald-50 border border-emerald-200"}`}>
            <span className={`font-semibold ${d?"text-emerald-300":"text-emerald-700"}`}>
              ✓ {cohort.n_patients} {isEN?"patients generated":"hasta üretildi"}
            </span>
            <span className={`ml-2 ${d?"text-slate-400":"text-slate-500"}`}>
              {Object.entries(cohort.risk_counts||{}).filter(([,v])=>v>0)
                .map(([k,v])=>`${riskLabels[k]||k.toUpperCase()}:${v}`).join(" · ")}
            </span>
          </div>
          {valResult&&(
            <div className={`rounded-xl px-3 py-2 text-xs flex gap-3 items-center ${d?"bg-indigo-500/10 border border-indigo-500/20":"bg-indigo-50 border border-indigo-200"}`}>
              <span className={`font-semibold ${d?"text-indigo-300":"text-indigo-700"}`}>🤖 GNN v2:</span>
              <span className="text-emerald-400">✓{valResult.n_good} {isEN?"good":"iyi"}</span>
              {valResult.n_warn>0&&<span className="text-amber-400">⚠{valResult.n_warn}</span>}
              {valResult.n_critical>0&&<span className="text-red-400">✗{valResult.n_critical}</span>}
            </div>
          )}
        </div>
      )}

      {error&&(
        <div className={`mt-2 text-xs rounded-lg px-3 py-2 ${d?"bg-red-500/10 text-red-300 border border-red-500/20":"bg-red-50 text-red-700 border border-red-200"}`}>
          ✗ {error}
        </div>
      )}
    </div>
  );
}

function GNNSourcePanel({ dark, isEN }) {
  const d=dark;
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(()=>{
    setLoading(true);
    apiGet("/gan/gnn-source-stats")
      .then(s=>{ setStats(s); setLoading(false); })
      .catch(()=>setLoading(false));
  },[]);

  useEffect(()=>{
    loadStats();
    // Tab aktif olduğunda ve GNN üretim tamamlandığında yenile
    const handler=()=>loadStats();
    window.addEventListener("sting:gnn_cohort_ready", handler);
    window.addEventListener("focus", handler);
    return()=>{
      window.removeEventListener("sting:gnn_cohort_ready", handler);
      window.removeEventListener("focus", handler);
    };
  },[loadStats]);

  const card=`rounded-2xl border p-4 ${d?"bg-slate-900 border-amber-900/30":"bg-white border-amber-200"}`;

  if(loading) return (
    <div className={card}>
      <p className={`text-xs ${d?"text-slate-500":"text-slate-400"}`}>
        {isEN?"Loading GNN source data…":"GNN kaynak verisi yükleniyor…"}
      </p>
    </div>
  );

  const hasData = stats?.n_patients > 0;

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <p className={`text-sm font-semibold ${d?"text-slate-200":"text-slate-700"}`}>
            🗄 {isEN?"GNN Training Source (Tab 5 Output)":"GNN Eğitim Kaynağı (Tab 5 Çıktısı)"}
          </p>
          <p className={`text-xs mt-0.5 ${d?"text-slate-500":"text-slate-400"}`}>
            {isEN
              ?"GAN learns from these GNN-generated patient summaries + contextual factors you set below."
              :"GAN bu GNN hasta özetlerini + aşağıda belirlediğiniz çevresel/yaşamsal faktörleri öğrenir."}
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-lg font-semibold ${
          hasData?(d?"bg-emerald-500/20 text-emerald-400":"bg-emerald-100 text-emerald-700")
                 :(d?"bg-amber-500/20 text-amber-400":"bg-amber-100 text-amber-700")
        }`}>
          {hasData?`✓ ${stats.n_patients} ${isEN?"records":"kayıt"}`:`⚠ ${isEN?"No GNN data":"GNN verisi yok"}`}
        </span>
      </div>

      {!hasData&&(
        <p className={`text-xs ${d?"text-amber-500":"text-amber-600"}`}>
          ⚠ {isEN?"Generate patients in Tab 5 (GNN) first, then return here to train GAN."
                  :"Önce Tab 5 (GNN)'de sentetik hasta üretin, sonra buraya dönüp GAN'ı eğitin."}
        </p>
      )}

      {hasData&&(
        <>
          {/* İstatistikler */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-3">
            {[
              {l:isEN?"GNN Patients":"GNN Hasta",  v:stats.n_patients,           c:"#38bdf8"},
              {l:isEN?"Features":"Özellik",         v:stats.feature_preview?.length||"—", c:"#818cf8"},
              {l:isEN?"Cohorts":"Kohort",            v:stats.cohorts?.length||1,  c:"#f97316"},
              {l:isEN?"Source":"Kaynak",             v:"GNN Tab5",                c:"#34d399"},
            ].map(({l,v,c})=>(
              <div key={l} className={`rounded-xl p-2.5 text-center border ${d?"bg-slate-800 border-slate-700":"bg-slate-50 border-slate-200"}`}>
                <p className="text-base font-bold" style={{color:c}}>{v}</p>
                <p className={`text-xs mt-0.5 ${d?"text-slate-500":"text-slate-400"}`}>{l}</p>
              </div>
            ))}
          </div>

          {/* Feature preview */}
          {stats.feature_preview?.length>0&&(
            <div>
              <p className={`text-xs font-semibold mb-1.5 ${d?"text-slate-400":"text-slate-600"}`}>
                {isEN?"Input features (GNN summary → GAN training vector):":"Girdi özellikleri (GNN özeti → GAN eğitim vektörü):"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {stats.feature_preview.map(k=>(
                  <span key={k} className={`text-xs px-2 py-0.5 rounded-lg font-mono ${d?"bg-slate-800 text-slate-400":"bg-slate-100 text-slate-600"}`}>
                    {k}
                  </span>
                ))}
                <span className={`text-xs px-2 py-0.5 rounded-lg font-mono ${d?"bg-amber-500/20 text-amber-400":"bg-amber-100 text-amber-700"}`}>
                  + {isEN?"extrinsic factors":"çevresel faktörler"}
                </span>
              </div>
            </div>
          )}

          {/* Son kohort listesi */}
          {stats.cohorts?.length>0&&(
            <div className="mt-3 space-y-1 max-h-24 overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <p className={`text-xs font-semibold ${d?"text-slate-400":"text-slate-600"}`}>
                  {isEN?"Cohorts":"Kohortlar"} ({stats.cohorts.length})
                </p>
                <button onClick={async()=>{
                  const msg=isEN?"Delete ALL cohorts? This cannot be undone.":"TÜM kohortlar silinsin mi? Geri alınamaz.";
                  if(!window.confirm(msg))return;
                  try{
                    await apiDel("/gnn/cohorts/all");
                    setStats(null); setLoading(true);
                    setTimeout(()=>loadStats(),300);
                  }catch(err){alert(`Hata: ${err.message}`);}
                }} className={`text-xs px-2 py-0.5 rounded border ${d?"border-red-500/30 text-red-400 hover:bg-red-500/10":"border-red-200 text-red-500 hover:bg-red-50"}`}>
                  🗑 {isEN?"Delete All":"Tümünü Sil"}
                </button>
              </div>
              {stats.cohorts.map((coh,i)=>(
                <div key={coh.job_id||i} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${d?"bg-slate-800":"bg-slate-50"}`}>
                  <span className={`px-1.5 py-0.5 rounded font-semibold ${d?"bg-emerald-500/20 text-emerald-400":"bg-emerald-100 text-emerald-700"}`}>
                    {i===0?(isEN?"latest":"son"):`-${i}`}
                  </span>
                  <span className={`font-semibold ${d?"text-slate-300":"text-slate-600"}`}>{coh.session_name||"GNN Cohort"}</span>
                  <span className={d?"text-slate-500":"text-slate-400"}>{coh.n_valid}/{coh.n_patients} {isEN?"valid":"geçerli"}</span>
                  <span className={`ml-auto ${d?"text-slate-600":"text-slate-400"}`}>{coh.created_at?.slice(0,16).replace("T"," ")}</span>
                  <button onClick={async(e)=>{
                      e.stopPropagation();
                      const name=coh.session_name||coh.job_id?.slice(0,8)||"?";
                      const msg=isEN
                        ?`Delete cohort "${name}"? This cannot be undone.`
                        :`"${name}" kohortunu silmek istiyor musunuz? Bu işlem geri alınamaz.`;
                      if(!window.confirm(msg))return;
                      if(!coh.job_id){alert("job_id bulunamadı");return;}
                      try{
                        await apiDel(`/gnn/cohort/${coh.job_id}`);
                        // Listeyi anında güncelle — silinen kaydı çıkar
                        setStats(prev=>prev?{
                          ...prev,
                          cohorts:(prev.cohorts||[]).filter(x=>x.job_id!==coh.job_id),
                          n_patients:prev.n_patients-(coh.n_valid||0),
                        }:prev);
                      }catch(err){
                        alert(`Silme hatası: ${err.message}`);
                      }
                    }}
                    className={`ml-1 text-xs px-1.5 py-0.5 rounded border ${d?"border-red-500/30 text-red-400 hover:bg-red-500/10":"border-red-200 text-red-500 hover:bg-red-50"}`}
                    title={isEN?"Delete cohort":"Kohort sil"}>✕</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Ekstrinsik Faktör Paneli
// ══════════════════════════════════════════════════════════════════════════════
function ExtrinsicPanel({ dark, isEN, schema, values, onChange }) {
  const d=dark;
  const [showRef, setShowRef] = useState(null);
  const [showPanelRef, setShowPanelRef] = useState(false);
  if(!schema?.length) return null;

  const kindIcon={"continuous":"📊","binary":"🔘","categorical":"📋"};

  return (
    <div className={`rounded-2xl border p-4 ${d?"bg-slate-900 border-amber-900/30":"bg-white border-amber-200"}`}>
      <div className="flex items-start justify-between mb-3 gap-2">
        <div>
          <p className={`text-sm font-semibold ${d?"text-slate-200":"text-slate-700"}`}>
            🧬 {isEN?"Unified Prognostic Risk Factors":"Birleşik Prognostik Risk Faktörleri"}
          </p>
          <p className={`text-xs mt-0.5 ${d?"text-slate-500":"text-slate-400"}`}>
            {isEN?"AICCONF 2026 IEEE — Table 1 (Köse, Ceylan & Surucu, 2026)":"AICCONF 2026 IEEE — Tablo 1 (Köse, Ceylan ve Surucu, 2026)"}
          </p>
        </div>
        <button title={isEN?"Source: Köse et al. 2026":"Kaynak: Köse et al. 2026"}
          className={`flex-shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${d?"bg-blue-500/20 text-blue-400":"bg-blue-100 text-blue-600"}`}
          onClick={()=>setShowPanelRef(v=>!v)}>ℹ</button>
      </div>

      {showPanelRef&&(
        <div className={`text-xs p-3 rounded-xl border mb-2 space-y-1 ${d?"bg-slate-800 border-slate-700 text-slate-400":"bg-blue-50 border-blue-200 text-blue-800"}`}>
          <p className="font-semibold mb-1">{isEN?"References — Table 1 (Köse et al. 2026)":"Kaynaklar — Tablo 1 (Köse et al. 2026)"}</p>
          <p>• Köse, U., Ceylan, O., &amp; Surucu, E. B. (2026). <em>A Unified Prognostic Data Architecture for Risk Stratification in Pediatric ALL.</em> AICCONF 2026, IEEE.</p>
          <p>• Berry et al. (2017). JAMA Oncology, 3(7), e170580. <em>[MRD]</em></p>
          <p>• He et al. (2024). Cancers, 16(5), 858. <em>[Genomic risk]</em></p>
          <p>• Conter et al. (2009). Blood, 114(22), 319. <em>[Day 8 steroid]</em></p>
          <p>• Hunger &amp; Mullighan (2015). NEJM, 373(16), 1541–1552. <em>[BM morphology]</em></p>
          <p>• Jastaniah et al. (2015). Hematology, 20(10), 561–566. <em>[CNS status]</em></p>
          <p>• Schultz et al. (2007). Blood, 109(3), 926–935. <em>[Age/WBC NCI]</em></p>
          <p>• Chang et al. (2021). Pediatric Blood &amp; Cancer, 68, e28371. <em>[Immunophenotype]</em></p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {schema.map(ef=>{
          const extrinsicFV=values[ef.id]??ef.default;
          const label=isEN?ef.label_en:ef.label_tr;
          return (
            <div key={ef.id}>
              <div className="flex items-center justify-between mb-1 gap-1">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <label className={`text-xs font-semibold truncate ${d?"text-slate-300":"text-slate-600"}`}>
                    {kindIcon[ef.kind]||"●"} {label}
                  </label>
                  {ef.ref&&(
                    <span title={ef.ref}
                      onClick={()=>setShowRef(showRef===ef.id?null:ef.id)}
                      className={`flex-shrink-0 w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center cursor-pointer ${d?"bg-blue-500/20 text-blue-400":"bg-blue-100 text-blue-600"}`}>
                      ℹ
                    </span>
                  )}
                </div>
                <span className={`text-xs font-mono font-bold flex-shrink-0 ${
                  extrinsicFV>0.6?"text-red-400":extrinsicFV>0.35?"text-amber-400":"text-emerald-400"}`}>
                  {ef.kind==="binary"?(extrinsicFV>0.5?(isEN?"Yes":"Var"):(isEN?"No":"Yok")):extrinsicFV.toFixed(2)}
                </span>
              </div>
              {ef.ref&&showRef===ef.id&&(
                <div className={`text-xs mb-1 p-2 rounded-lg italic ${d?"bg-slate-800 text-slate-400":"bg-blue-50 text-blue-700"}`}>
                  {ef.ref}
                </div>
              )}
              {ef.kind==="binary"?(
                <button onClick={()=>onChange(ef.id, extrinsicFV>0.5?0:1)}
                  className={`w-full py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    extrinsicFV>0.5
                    ?(d?"border-red-500/40 bg-red-500/20 text-red-300":"border-red-300 bg-red-50 text-red-700")
                    :(d?"border-slate-700 text-slate-400":"border-slate-200 text-slate-500")
                  }`}>
                  {extrinsicFV>0.5?(isEN?"Present ✓":"Var ✓"):(isEN?"Absent":"Yok")}
                </button>
              ):ef.kind==="categorical"&&ef.options?(
                <div className="flex gap-1 flex-wrap">
                  {ef.options.map((opt,oi)=>{
                    const optLabel=(isEN?ef.option_labels_en:ef.option_labels_tr)?.[oi]||`${opt}`;
                    const isActive=Math.abs(extrinsicFV-opt)<0.01;
                    return(
                      <button key={oi} onClick={()=>onChange(ef.id,opt)}
                        className={`text-xs px-2 py-1 rounded-lg border font-medium transition-all flex-1 min-w-0 ${
                          isActive?(d?"border-amber-500/40 bg-amber-500/20 text-amber-300":"border-amber-300 bg-amber-50 text-amber-700")
                                  :(d?"border-slate-700 text-slate-500":"border-slate-200 text-slate-400")
                        }`} title={optLabel}>
                        {optLabel.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              ):(
                <input type="range" min={ef.min} max={ef.max} step={0.05} value={extrinsicFV}
                  onChange={e=>onChange(ef.id, Number(e.target.value))}
                  className="w-full h-1.5 rounded-full accent-orange-400 cursor-pointer"
                  style={{background:`linear-gradient(to right, #f97316 ${(extrinsicFV-ef.min)/(ef.max-ef.min)*100}%, ${d?"#1e293b":"#fed7aa"} 0%)`}}/>
              )}
              <div className="flex justify-between text-xs mt-0.5" style={{color:d?"#475569":"#92400e"}}>
                <span className="truncate max-w-48">{ef.unit}</span>
                {ef.kind==="continuous"&&<span>{ef.min}–{ef.max}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Hasta Silueti — ekstrinsik risk overlay ile
// ══════════════════════════════════════════════════════════════════════════════
function GANSilhouette({ risk_class="high", extrinsic_risk=0.5, sex="M", size=52 }) {
  const riskCol=RISK_COLORS[risk_class]||"#f59e0b";
  const extCol=extrinsic_risk>0.6?"#ef4444":extrinsic_risk>0.35?"#f59e0b":"#10b981";
  const isFem=sex==="F";

  return (
    <svg width={size} height={size*1.55} viewBox="0 0 40 62" style={{overflow:"visible"}}>
      {/* Ekstrinsik risk halo */}
      <ellipse cx="20" cy="56" rx="13" ry="5" fill={`${riskCol}33`}>
        <animate attributeName="rx" values="11;16;11" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.6;0.15;0.6" dur="2s" repeatCount="indefinite"/>
      </ellipse>
      {/* Ekstrinsik risk dış halka (farklı renk) */}
      <circle cx="20" cy="9" r="12" fill="none" stroke={extCol} strokeWidth="0.8" opacity="0.4">
        <animate attributeName="r" values="11;17;11" dur="2.4s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.4;0;0.4" dur="2.4s" repeatCount="indefinite"/>
      </circle>
      {/* Klinik risk nabzı */}
      <circle cx="20" cy="9" r="9" fill="none" stroke={riskCol} strokeWidth="1.2" opacity="0">
        <animate attributeName="r" values="8;14;8" dur="1.8s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.5;0;0.5" dur="1.8s" repeatCount="indefinite"/>
      </circle>
      {/* Baş */}
      <circle cx="20" cy="9" r="7.5" fill={riskCol} opacity="0.9"/>
      {isFem?(
        <>
          <path d="M13 19 Q12 28 14 32 L20 35 L26 32 Q28 28 27 19 Z" fill={riskCol} opacity="0.85"/>
          <path d="M11 32 Q13 46 15 47 L25 47 Q27 46 29 32 L26 32 L20 35 L14 32 Z" fill={riskCol} opacity="0.8"/>
          <path d="M12.5 7 Q12 2 20 1.5 Q28 2 27.5 7" fill={riskCol} opacity="0.5"/>
          <path d="M13 22 L7 30 M27 22 L33 30" stroke={riskCol} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
        </>
      ):(
        <>
          <path d="M13 19 Q11 34 12 46 L15 46 L15 35 L20 37 L25 35 L25 46 L28 46 Q29 34 27 19 Z"
            fill={riskCol} opacity="0.85"/>
          <path d="M13 21 L7 31 M27 21 L33 31" stroke={riskCol} strokeWidth="4" strokeLinecap="round" opacity="0.8"/>
        </>
      )}
      {/* Ekstrinsik risk noktası — sağ omuz */}
      <circle cx="30" cy="20" r="3.5" fill={extCol} opacity="0.9"/>
      <circle cx="30" cy="20" r="5.5" fill="none" stroke={extCol} strokeWidth="0.8" opacity="0.5"/>
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GAN Hasta Modalı
// ══════════════════════════════════════════════════════════════════════════════
function GANPatientModal({ patient, schema, dark, isEN, onClose, onPrev, onNext, totalCount, currentIdx }) {
  const d=dark;
  if(!patient) return null;
  const c=patient.clinical||{}, ex=patient.extrinsic||{}, s=patient.summary||{};
  const riskCol=RISK_COLORS[patient.risk_class]||"#f59e0b";
  const riskLbl=isEN?RISK_LABELS_EN[patient.risk_class]:RISK_LABELS_TR[patient.risk_class];

  // Değerleri hem extrinsic hem clinical'dan çek
  const mrdD29   = parseFloat(ex.resp_mrd_d29_pct || c.mrd_d29  || 0);
  const mrdEoc   = parseFloat(ex.resp_eoc_mrd_pct  || c.mrd_eoc  || 0);
  const mrdD8    = parseFloat(c.mrd_d8 || (mrdD29 * 3) || 0);
  const piCog    = parseFloat(ex.resp_pi_cog_score  || c.resp_pi_cog_score  || 0);
  const piUkall  = parseFloat(ex.resp_pi_ukall_score|| c.resp_pi_ukall_score || 0);
  const efsLow   = parseFloat(ex.prog_efs_5y_lower  || ex.efs_5y_lower || 75);
  const efsHigh  = parseFloat(ex.prog_efs_5y_upper  || ex.efs_5y_upper || 90);
  const osLow    = parseFloat(ex.prog_os_5y_lower   || 82);
  const osHigh   = parseFloat(ex.prog_os_5y_upper   || 93);
  const relapseCat = ex.prog_relapse_risk_cat || "intermediate";
  const progSource = ex.prog_source || "";
  const piInterp   = ex.pi_interpretation || "";
  const piInterpTxt= ex.pi_interpretation_text || ex.risk_reasons || "";
  const riskReasons= ex.risk_reasons || "";
  const riskNci    = ex.risk_nci_binary || "";
  const fRes       = parseFloat(c.resistant_fraction || ex.resistant_fraction || 0);
  const pgr        = ex.resp_steroid_d8_pgr > 0.5;
  const d15morph   = ex.resp_bm_d15_morph || "M1";
  const bsa        = parseFloat(c.bsa || 0);

  const mrdNegD29 = mrdD29 < 0.01;
  const mrdNegEoc = mrdEoc < 0.01;

  const Section = ({title, children}) => (
    <div className={`rounded-xl border overflow-hidden ${d?"border-slate-700":"border-slate-200"}`}>
      <div className={`px-4 py-2 text-xs font-bold tracking-wide ${d?"bg-slate-800 text-slate-300":"bg-slate-100 text-slate-600"}`}>
        {title}
      </div>
      <div className={`px-4 py-3 ${d?"bg-slate-900":"bg-white"}`}>{children}</div>
    </div>
  );

  const Row = ({label, value, valueColor, bold}) => (
    <div className="flex items-center justify-between py-0.5">
      <span className={`text-xs ${d?"text-slate-400":"text-slate-500"}`}>{label}</span>
      <span className={`text-xs ${bold?"font-bold":"font-semibold"} ${d?"text-slate-200":"text-slate-700"}`}
            style={valueColor?{color:valueColor}:{}}>
        {value}
      </span>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div className={`rounded-2xl border shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto ${d?"bg-slate-950 border-slate-700":"bg-white border-slate-300"}`}
           onClick={e=>e.stopPropagation()}>

        {/* ── Header ── */}
        <div className={`sticky top-0 z-10 px-5 py-3 border-b flex items-center justify-between ${d?"bg-slate-950 border-slate-800":"bg-slate-50 border-slate-200"}`}>
          <div className="flex items-center gap-3">
            <GANSilhouette risk_class={patient.risk_class} extrinsic_risk={patient.extrinsic_risk_score||0} sex={c.sex||"M"} size={44}/>
            <div>
              <p className={`text-sm font-black ${d?"text-white":"text-slate-800"}`}>
                {isEN?"STING — Pediatric ALL Digital Twin":"STING — Pediatrik ALL Dijital İkiz"}
              </p>
              <p className={`text-xs ${d?"text-slate-400":"text-slate-500"}`}>
                {isEN?"Patient:":"Hasta:"} {patient.patient_id} &nbsp;·&nbsp;
                <span className={d?"text-amber-400":"text-amber-600"}>
                  {isEN?"SYNTHETIC — GAN production, not a real patient":"SENTETİK — GAN üretimi, gerçek hasta değildir"}
                </span>
              </p>
              <div className="flex gap-2 mt-0.5 flex-wrap">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{background:`${riskCol}22`,color:riskCol}}>{riskLbl}</span>
                {efsLow>0&&<span className={`text-xs px-2 py-0.5 rounded-full ${d?"bg-slate-800 text-slate-400":"bg-slate-100 text-slate-500"}`}>
                  ~{efsLow}–{efsHigh}% EFS
                </span>}
                {mrdD29>0&&<span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  mrdNegD29?(d?"bg-emerald-900/30 text-emerald-400":"bg-emerald-100 text-emerald-700")
                           :(d?"bg-red-900/30 text-red-400":"bg-red-100 text-red-700")}`}>
                  {mrdNegD29?"MRD−":"MRD+"}
                </span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totalCount>1&&(<>
              <button onClick={e=>{e.stopPropagation();onPrev&&onPrev();}}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${d?"bg-slate-800 text-slate-300":"bg-slate-100 text-slate-600"}`}>←</button>
              <span className={`text-xs ${d?"text-slate-500":"text-slate-400"}`}>{currentIdx+1}/{totalCount}</span>
              <button onClick={e=>{e.stopPropagation();onNext&&onNext();}}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${d?"bg-slate-800 text-slate-300":"bg-slate-100 text-slate-600"}`}>→</button>
            </>)}
            <button onClick={onClose} className={`w-7 h-7 rounded-lg flex items-center justify-center ${d?"bg-slate-800 text-slate-400":"bg-slate-100 text-slate-600"}`}>✕</button>
          </div>
        </div>

        <div className="p-4 space-y-3">

          {/* ── Risk Sınıfı ── */}
          <div className="rounded-xl border-2 p-4" style={{borderColor:riskCol, background:`${riskCol}10`}}>
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="text-xl font-black mb-1" style={{color:riskCol}}>
                  {(patient.risk_class||"?").toUpperCase()} - {riskLbl}
                </div>
                {riskNci&&(
                  <div className="flex gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${d?"bg-slate-800 text-slate-300":"bg-slate-100 text-slate-600"}`}>
                      NCI: {riskNci}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${d?"bg-slate-800 text-slate-300":"bg-slate-100 text-slate-600"}`}>
                      {isEN?"Relapse cat.":"Relaps kat."}: {relapseCat}
                    </span>
                  </div>
                )}
                {riskReasons&&(
                  <>
                    <p className={`text-xs font-semibold mb-0.5 ${d?"text-slate-400":"text-slate-500"}`}>
                      {isEN?"Diagnosis-side:":"Tanı-tarafı:"}
                    </p>
                    <p className={`text-xs mb-1.5 ${d?"text-slate-300":"text-slate-700"}`}>{riskReasons}</p>
                  </>
                )}
                {(mrdD29>0||pgr)&&(
                  <>
                    <p className={`text-xs font-semibold mb-0.5 ${d?"text-slate-400":"text-slate-500"}`}>
                      {isEN?"Response-side:":"Yanıt-tarafı:"}
                    </p>
                    <p className={`text-xs ${d?"text-slate-300":"text-slate-700"}`}>
                      {isEN?"D8":""} {pgr?"PGR (iyi)":"PPR (kötü)"}; D15 {d15morph};
                      D29 MRD %{(mrdD29).toFixed(4)} ({mrdNegD29?"MRD-":"MRD+"});
                      EOC MRD %{(mrdEoc).toFixed(4)}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Kimlik & Antropometri ── */}
          <Section title={isEN?"IDENTITY & ANTHROPOMETRICS":"KİMLİK & ANTROPOMETRİ"}>
            <div className="grid grid-cols-3 gap-x-6 gap-y-0.5">
              <Row label={isEN?"Age":"Yaş"} value={`${c.age?.toFixed(0)} ${isEN?"y":"yıl"}`} bold/>
              <Row label={isEN?"Sex":"Cinsiyet"} value={c.sex==="F"?(isEN?"F":"K"):c.sex==="M"?(isEN?"M":"E"):c.sex||"—"} bold/>
              <Row label="BSA" value={`${bsa.toFixed(2)} m²`} bold/>
              <Row label={isEN?"Weight":"Ağırlık"} value={`${c.weight_kg?.toFixed(1)} kg`}/>
              <Row label={isEN?"Height":"Boy"} value={`${c.height_cm?.toFixed(0)} cm`}/>
              <Row label={isEN?"Ethnic":"Etnik"} value={ex.eth_group||"—"}/>
            </div>
          </Section>

          {/* ── Tanı ── */}
          <Section title={isEN?"DIAGNOSIS":"TANI"}>
            <div className="grid grid-cols-3 gap-x-6 gap-y-0.5">
              <Row label="WBC" value={`${c.wbc0?.toFixed(1)} G/L`} bold valueColor={c.wbc0>=50?"#ef4444":undefined}/>
              <Row label={isEN?"Subtype":"Alt-tip"} value={ex.pat_all_subtype||"B-ALL"} bold/>
              <Row label="CNS" value={ex.pat_cns_status||"CNS1"}
                valueColor={ex.pat_cns_status==="CNS3"?"#ef4444":ex.pat_cns_status==="CNS2"?"#f59e0b":undefined}/>
              <Row label={isEN?"Testis":"Testis"} value={ex.pat_testis_inv>0.5?(isEN?"Yes":"Var"):(isEN?"No":"Yok")}/>
              <Row label={isEN?"Extramed.":"Ekstramed."} value={ex.pat_extramed_inv>0.5?(isEN?"Yes":"Var"):(isEN?"No":"Yok")}/>
              <Row label={isEN?"Infection":"Enfeksiyon"} value={ex.infection>0.5?(isEN?"Yes":"Var"):(isEN?"No":"Yok")}
                valueColor={ex.infection>0.5?"#ef4444":undefined}/>
            </div>
          </Section>

          {/* ── Sitogenetik / Moleküler ── */}
          <Section title={isEN?"CYTOGENETICS / MOLECULAR":"SİTOGENETİK / MOLEKÜLER"}>
            <div className="space-y-1">
              <Row label={isEN?"Favorable:":"Favorable:"}
                value={[
                  ex.gen_etv6_runx1>0.5?"ETV6-RUNX1":null,
                  ex.gen_high_hyperdip>0.5?(isEN?"High Hyperdip":"Yüksek Hiperdiploidi"):null,
                ].filter(Boolean).join(", ")||(isEN?"None":"Yok")}
                valueColor="#22c55e" bold/>
              <Row label={isEN?"Adverse/VHR:":"Adverse/VHR:"}
                value={[
                  ex.gen_bcr_abl1>0.5?"BCR-ABL1":null,
                  ex.gen_ph_like>0.5?"Ph-like":null,
                  ex.gen_kmt2a_r>0.5?"KMT2A-R":null,
                  ex.gen_hypodiploidy>0.5?(isEN?"Hypodiploidy":"Hipodiploidi"):null,
                  ex.gen_tcf3_hlf>0.5?"TCF3-HLF":null,
                ].filter(Boolean).join(", ")||(isEN?"None":"Yok")}
                valueColor="#ef4444" bold/>
              <Row label={isEN?"Other mol.:":"Diğer molek.:"}
                value={[
                  ex.gen_ikzf1_del>0.5?"IKZF1 del":null,
                  ex.gen_iamp21>0.5?"iAMP21":null,
                  ex.gen_cdkn2ab_del>0.5?"CDKN2A/B del":null,
                  ex.gen_pax5_del>0.5?"PAX5 del":null,
                ].filter(Boolean).join(", ")||(isEN?"None":"Yok")}/>
              <Row label={isEN?"Pharmacogen.:":"Farmakogen.:"}
                value={[
                  `TPMT=${ex.phg_tpmt_status||"normal"}`,
                  ex.phg_anti_asp_ab>0.5?"Anti-ASP Ab+":null,
                  ex.phg_cyp3a5_3>0.5?"CYP3A5*3+":null,
                ].filter(Boolean).join(", ")}/>
            </div>
          </Section>

          {/* ── Risk Sınıflandırması ── */}
          <Section title={isEN?"RISK CLASSIFICATION":"RİSK SINIFLANDIRMASI"}>
            <div className="flex gap-1 mb-3">
              {[
                {id:"lr",l:"LR",c:"#10b981"},
                {id:"sr",l:"SR",c:"#34d399"},
                {id:"ir",l:"IR",c:"#f59e0b"},
                {id:"hr",l:"HR",c:"#ef4444"},
                {id:"vhr",l:"VHR",c:"#7c3aed"},
              ].map(({id,l,c})=>{
                const active=patient.risk_class===id;
                return (
                  <div key={id} className="flex-1 rounded-lg py-2 text-center"
                    style={{background:active?`${c}30`:`${c}10`,border:active?`2px solid ${c}`:`1px solid ${c}33`}}>
                    <p className="text-xs font-black" style={{color:c,opacity:active?1:0.4}}>{l}</p>
                  </div>
                );
              })}
            </div>
            <p className={`text-xs ${d?"text-slate-500":"text-slate-400"}`}>
              {isEN
                ?"Risk class integrates clinical, genomic and early-response parameters."
                :"Risk sınıfı klinik, genomik ve erken yanıt parametrelerini entegre eder."}
            </p>
          </Section>

          {/* ── Tedavi Yanıtı & MRD ── */}
          <Section title={isEN?"TREATMENT RESPONSE & MRD":"TEDAVİ YANITI & MRD"}>
            {/* MRD özet badge'leri */}
            <div className="flex gap-2 flex-wrap mb-3">
              {[
                {l:isEN?"D8 Steroid":"D8 Steroid", v:pgr?(isEN?"PGR (good)":"PGR (iyi)"):(isEN?"PPR (poor)":"PPR (kötü)"), col:pgr?"#22c55e":"#ef4444"},
                {l:isEN?"D15 Morph.":"D15 Morf.", v:d15morph, col:d15morph==="M1"?"#22c55e":d15morph==="M2"?"#f59e0b":"#ef4444"},
                {l:"EOI", v:mrdNegD29?"MRD−":"MRD+", col:mrdNegD29?"#22c55e":"#ef4444"},
              ].map(({l,v,col})=>(
                <div key={l} className={`rounded-xl px-3 py-2 text-center border flex-1 ${d?"bg-slate-800 border-slate-700":"bg-white border-slate-200"}`}>
                  <p className="text-sm font-bold" style={{color:col}}>{v}</p>
                  <p className={`text-xs ${d?"text-slate-500":"text-slate-400"}`}>{l}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-x-6 gap-y-0.5">
              <Row label="D29 MRD"
                value={`%${(mrdD29).toFixed(4)}`}
                valueColor={mrdNegD29?"#22c55e":mrdD29<0.1?"#f59e0b":"#ef4444"} bold/>
              <Row label="EOC MRD"
                value={`%${(mrdEoc).toFixed(4)}`}
                valueColor={mrdNegEoc?"#22c55e":mrdEoc<0.1?"#f59e0b":"#ef4444"}/>
              <Row label="f_res (latent)" value={fRes>0?fRes.toFixed(5):"—"}
                valueColor={fRes>0.01?"#ef4444":fRes>0.005?"#f59e0b":undefined}/>
            </div>
          </Section>

          {/* ── PI Advisory ── */}
          <Section title={isEN?"PI - ADVISORY / MODEL-BASED APPROACH":"PI - ADVİSORY / MODEL-TÜREVİ YAKLAŞIM"}>
            <div className="grid grid-cols-3 gap-x-6 gap-y-0.5 mb-2">
              <Row label="PI COG" value={piCog.toFixed(2)} bold
                valueColor={piCog>0.6?"#ef4444":piCog>0.3?"#f59e0b":"#22c55e"}/>
              <Row label="PI UKALL" value={piUkall.toFixed(2)} bold
                valueColor={piUkall>0.6?"#ef4444":piUkall>0.3?"#f59e0b":"#22c55e"}/>
              <Row label={isEN?"Comment":"Yorum"} value={piInterp||"CONCORDANT"} bold
                valueColor={piInterp==="POTENTIAL_DISCORDANCE"?"#f59e0b":piInterp==="CONCORDANT"?"#22c55e":undefined}/>
            </div>
            {piInterpTxt&&(
              <p className={`text-xs mt-1 ${d?"text-slate-500":"text-slate-400"}`}>{piInterpTxt}</p>
            )}
            <p className={`text-xs mt-1 italic ${d?"text-slate-600":"text-slate-400"}`}>
              {isEN
                ?"PI advisory/post-hoc; not the primary determinant of leukemia risk."
                :"PI advisory/post-hoc; nihai lösemi riskinin birincil belirleyicisi değildir."}
            </p>
          </Section>

          {/* ── Prognoz ── */}
          <Section title={isEN?"PROGNOSIS (5-year estimate, literature-based)":"PROGNOZ (5-yıl tahmini, literatür-temelli)"}>
            <div className="grid grid-cols-3 gap-x-6 gap-y-0.5">
              <Row label="EFS 5y" value={`%${efsLow}–${efsHigh}`} bold
                valueColor={efsLow>=88?"#22c55e":efsLow>=60?"#f59e0b":"#ef4444"}/>
              <Row label="OS 5y" value={`%${osLow}–${osHigh}`} bold
                valueColor={osLow>=90?"#22c55e":osLow>=60?"#f59e0b":"#ef4444"}/>
              <Row label={isEN?"Source":"Kaynak"} value={progSource||"—"}/>
            </div>
          </Section>

          {/* ── Tedavi Protokolü ── */}
          <Section title={isEN?"TREATMENT PROTOCOL (Multi-drug, 4 phases) — BSA-scaled dose":"TEDAVİ PROTOKOLÜ (Çoklu ilaç, 4 faz) — BSA-ölçekli doz"}>
            <p className={`text-xs mb-2 ${d?"text-slate-500":"text-slate-400"}`}>
              {isEN
                ?`Patient BSA=${bsa.toFixed(2)} m² — scaled nominal doses (patient-specific GA optimization is a separate step)`
                :`Hasta BSA=${bsa.toFixed(2)} m² ile ölçeklenmiş nominal dozlar (kisiye özel GA optimizasyonu ayrı aşama)`}
            </p>
            <p className={`text-xs mb-2 font-medium ${d?"text-slate-400":"text-slate-500"}`}>
              {isEN
                ?"Induction G0-29 | Consolidation G29-84 | Re-ind G84-140 | Maintenance G140-250"
                :"İndüksiyon G0-29 | Konsolidasyon G29-84 | Re-ind G84-140 | İdame G140-250"}
            </p>
            <div className="flex gap-2 flex-wrap">
              {(()=>{
                const doseMap = {
                  "6mp":            {dose:c.dose_6mp_mg,     unit:"mg/gün (G140+)", lbl:"6-MP", col:"#6366f1"},
                  "mtx":            {dose:c.dose_mtx_mg,     unit:"mg (tüm fazlar)", lbl:"MTX", col:"#8b5cf6"},
                  "vcr":            {dose:c.dose_vcr_mg,     unit:"mg (G1-22,+idame)", lbl:"VCR", col:"#a78bfa"},
                  "daunorubicin":   {dose:c.dose_dnr_mg_m2,  unit:"mg (G1-22)", lbl:"DNR", col:"#ec4899"},
                  "asparaginase":   {dose:c.peg_dose_per_m2, unit:"IU (G4,36,57,91)", lbl:"PEG-ASP", col:"#f97316"},
                  "corticosteroid": {dose:c.dose_ster_mg_m2, unit:"mg/g (G0-28)", lbl:"Prednizolon", col:"#eab308"},
                  "cytarabine":     {dose:c.dose_arac_mg_m2, unit:"mg (G31-55)", lbl:"Ara-C", col:"#14b8a6"},
                  "cyclophosphamide":{dose:c.dose_cpm_mg_m2, unit:"mg (G29+)", lbl:"Siklofosfamid", col:"#0ea5e9"},
                };
                return Object.entries(doseMap).map(([key,{dose,unit,lbl,col}])=>{
                  if(!(dose>0)) return null;
                  return (
                    <div key={key} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold border"
                         style={{background:`${col}15`,borderColor:`${col}44`,color:col}}>
                      <span className="font-bold">{lbl}</span>
                      <span className={`ml-1 ${d?"opacity-70":"opacity-80"}`}>{dose?.toFixed(0)} {unit}</span>
                    </div>
                  );
                }).filter(Boolean);
              })()}
            </div>
          </Section>

          {/* ── Güvenlik & DSS ── */}
          <Section title={isEN?"SAFETY & DSS WARNINGS — ADVISORY LAYER":"GÜVENLİK & DSS UYARILARI — ADVİSORY KATMAN"}>
            <div className="grid grid-cols-3 gap-x-6 gap-y-0.5 mb-2">
              <Row label={isEN?"DNR cardio":"DNR kardiyo"}
                value={`${(s.cum_DNR||ex.adv_cum_DNR_mgm2||150)} mg/m²`}/>
              <Row label={isEN?"Cum. DNR":"Kum. DNR"}
                value={`${(ex.adv_cum_DNR_mgm2||150).toFixed(0)} mg/m²`}
                valueColor={(ex.adv_cum_DNR_mgm2||150)>300?"#ef4444":undefined}/>
              <Row label="VIPN min" value={(s.vipn_min||ex.adv_VIPN_min||0.7).toFixed(2)}
                valueColor={(s.vipn_min||0.7)<0.5?"#ef4444":(s.vipn_min||0.7)<0.7?"#f59e0b":"#22c55e"}/>
            </div>
            <p className={`text-xs italic ${d?"text-slate-600":"text-slate-400"}`}>
              {isEN
                ?"Advisory layer for leukemia-risk classification SHOULD NOT BE USED."
                :"Advisory katman lösemi-risk sınıflandırmasında KULLANILMAZ."}
            </p>
          </Section>

          {/* ── Uyarı Notu ── */}
          <div className={`rounded-xl px-4 py-2 text-xs text-center ${d?"bg-slate-800 text-slate-500":"bg-slate-100 text-slate-400"}`}>
            {isEN
              ?"STING TÜBİTAK 123E383 — GAN synthetic profile + post-hoc ODE/risk/PI"
              :"STING TÜBİTAK 123E383 — GAN sentetik profil + post-hoc ODE/risk/PI"}
            <span className="ml-4">{isEN?"Academic/In-silico — not a clinical decision":"Akademik/In-silico — klinik karar değildir"}</span>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// GAN Kohort Grid
// ══════════════════════════════════════════════════════════════════════════════
function GANCohortGrid({ patients, dark, isEN, schema, onSelect }) {
  const d=dark;
  const [viewMode, setViewMode] = useState("risk");
  if(!patients?.length) return null;

  const cnt={lr:0,sr:0,ir:0,hr:0,vhr:0};
  patients.forEach(p=>{const rc=p.risk_class||"sr"; cnt[rc]=(cnt[rc]||0)+1;});
  const totalRisk=patients.length;

  const getColor=(p)=>{
    switch(viewMode){
      case"risk":
        return {border:`${RISK_COLORS[p.risk_class]}55`,bg:d?`${RISK_COLORS[p.risk_class]}12`:`${RISK_COLORS[p.risk_class]}10`,
                label:(isEN?RISK_LABELS_EN:RISK_LABELS_TR)[p.risk_class]?.split(" ")[0]||"—",
                labelColor:RISK_COLORS[p.risk_class]};
      case"extrinsic":{
        const v=p.extrinsic_risk_score||0;
        const col=v>0.6?"#ef4444":v>0.35?"#f59e0b":"#10b981";
        return {border:`${col}55`,bg:d?`${col}12`:`${col}10`,label:`${(v*100).toFixed(0)}%`,labelColor:col};
      }
      default:{
        const ef=schema?.find(s=>s.id===viewMode);
        const extrinsicFV=p.extrinsic?.[viewMode]??0;
        const col=extrinsicFV>0.6?"#ef4444":extrinsicFV>0.35?"#f59e0b":"#10b981";
        let label;
        if(ef?.kind==="binary"){
          label=extrinsicFV>0.5?(isEN?"Yes":"Var"):(isEN?"No":"Yok");
        } else if(ef?.kind==="categorical"&&ef?.options){
          // En yakın seçeneğin etiketini bul
          const oi=ef.options.reduce((best,opt,i)=>
            Math.abs(opt-extrinsicFV)<Math.abs(ef.options[best]-extrinsicFV)?i:best, 0);
          const labels=isEN?ef.option_labels_en:ef.option_labels_tr;
          label=labels?.[oi]?.split(" ")[0]||extrinsicFV.toFixed(2);
        } else {
          // continuous: yüzde olarak göster (0-1 arası normalize)
          label=`${(extrinsicFV*100).toFixed(0)}%`;
        }
        return {border:`${col}55`,bg:d?`${col}12`:`${col}10`,label,labelColor:col};
      }
    }
  };

  // Filtre butonu etiketleri — tam açıklayıcı (kısaltma yok)
  const VIEW_LABELS_EN = {
    "age_group":             "Age Group (NCI)",
    "wbc_initial_high":      "WBC at Diagnosis",
    "immunophenotype":       "Immunophenotype (B/T-ALL)",
    "cns_status":            "CNS Status",
    "genomic_risk":          "Genomic Risk",
    "day8_steroid_response": "Day 8 Steroid",
    "day15_bm_morphology":   "Day 15 BM Morphology",
    "mrd_eoi":               "MRD End-Induction",
    "ses_index":             "Socioeconomic",
    "infection_history":     "Infection History",
    "family_hematologic":    "Family Hematol.",
  };
  const VIEW_LABELS_TR = {
    "age_group":             "Yaş Grubu (NCI)",
    "wbc_initial_high":      "Tanı Anı WBC",
    "immunophenotype":       "İmmünofenotip (B/T-ALL)",
    "cns_status":            "SSS Durumu",
    "genomic_risk":          "Genomik Risk",
    "day8_steroid_response": "Gün 8 Steroid",
    "day15_bm_morphology":   "Gün 15 KİM",
    "mrd_eoi":               "MRD İnd. Sonu",
    "ses_index":             "Sosyoekonomik",
    "infection_history":     "Enfeksiyon Geçmişi",
    "family_hematologic":    "Aile Hematolojik",
  };
  const viewLabel = (ef) => {
    const map = isEN ? VIEW_LABELS_EN : VIEW_LABELS_TR;
    return map[ef.id] || (isEN ? ef.label_en : ef.label_tr);
  };

  const views=[
    {id:"risk",       label:isEN?"Risk Class (LR–VHR)":"Risk Sınıfı (LR–VHR)", icon:"🎯"},
    {id:"contextual", label:isEN?"Prognostic Score":"Prognostik Skor",          icon:"📊"},
    ...(schema||[]).map(ef=>({id:ef.id, label:viewLabel(ef), icon:"●"})),
  ];

  return (
    <div className={`rounded-2xl border p-5 ${d?"bg-slate-900 border-amber-900/30":"bg-white border-amber-200"}`}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div>
          <p className={`text-sm font-semibold ${d?"text-slate-200":"text-slate-700"}`}>
            🧬 {isEN?"GAN Enhanced Digital Twin Patients":"GAN Zenginleştirilmiş Dijital İkiz Hastalar"}
            <span className={`ml-2 text-xs font-normal ${d?"text-slate-500":"text-slate-400"}`}>({patients.length})</span>
          </p>
          <p className={`text-xs ${d?"text-slate-500":"text-slate-400"}`}>{isEN?"Click for details":"Detaylar için tıklayın"}</p>
        </div>
        <div className="flex gap-1.5">
          {Object.entries(cnt).map(([k,v])=>(
            <div key={k} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold"
                 style={{background:`${RISK_COLORS[k]}18`,color:RISK_COLORS[k]}}>{v}</div>
          ))}
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-1 flex-wrap mb-4 overflow-x-auto pb-1">
        {views.map(v=>(
          <button key={v.id} onClick={()=>setViewMode(v.id)}
            className={`text-xs px-2 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${
              viewMode===v.id
                ?(d?"border border-amber-500/40 bg-amber-500/20 text-amber-300":"border border-amber-300 bg-amber-100 text-amber-700")
                :(d?"border border-slate-700 text-slate-500":"border border-slate-200 text-slate-400")
            }`}>
            <span>{v.icon}</span><span>{v.label}</span>
          </button>
        ))}
      </div>

      {/* Siluet grid */}
      {/* Mini-dot açıklaması */}
      <div className={`flex items-center gap-3 flex-wrap mb-2 px-1 text-xs ${d?"text-slate-500":"text-slate-400"}`}>
        <span>{isEN?"Color border = risk class":"Renkli kenar = risk sınıfı"}</span>
        <span>·</span>
        <span>{isEN?"Bottom dots = active drugs":"Alt noktalar = aktif ilaçlar"}</span>
        {[["6mp","#3b82f6","6-MP"],["mtx","#10b981","MTX"],["vcr","#f59e0b","VCR"],["daunorubicin","#ef4444","DNR"],["asparaginase","#8b5cf6","PEG"]].map(([,col,lbl])=>(
          <span key={lbl} className="flex items-center gap-0.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{background:col}}/>
            <span>{lbl}</span>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2.5 justify-center">
        {patients.map((p,i)=>{
          const {border,bg,label,labelColor}=getColor(p);
          return (
            <button key={p.patient_id||i} onClick={()=>onSelect&&onSelect(p)}
              className="flex flex-col items-center gap-1 p-2 rounded-2xl border-2 transition-all hover:scale-110 hover:shadow-xl cursor-pointer relative"
              style={{background:bg,borderColor:border,minWidth:"72px"}}>
              {/* Risk dot overlay */}
              {viewMode!=="risk"&&(
                <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full border border-white"
                     style={{background:RISK_COLORS[p.risk_class]||"#f59e0b"}}/>
              )}
              {/* GNN v2 kalite badge */}
              {p.gnn_v2_quality&&(
                <div className={`absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full border border-white ${
                  p.gnn_v2_quality==="good"?"bg-emerald-400"
                  :p.gnn_v2_quality==="warn"?"bg-amber-400":"bg-red-400"
                }`} title={`GNN v2: ${p.gnn_v2_quality}`}/>
              )}
              <GANSilhouette risk_class={p.risk_class} extrinsic_risk={p.extrinsic_risk_score||0}
                sex={p.clinical?.sex||"M"} size={34}/>
              <p className={`text-xs font-bold ${d?"text-slate-300":"text-slate-600"}`}>
                #{(p.patient_id||String(i+1)).slice(-4)}
              </p>
              {p.clinical?.sex&&(
                <p className={`text-xs ${p.clinical.sex==="F"?"text-pink-400":"text-blue-400"}`}>
                  {p.clinical.sex==="F"?"♀":"♂"}
                </p>
              )}
              <p className="text-xs font-mono font-bold" style={{color:labelColor}}>{label}</p>
              {/* MRD D29 mini badge — GAN v2'den */}
              {p.clinical?.mrd_d29!=null&&p.clinical.mrd_d29>0.0001&&(
                <p className={`text-xs font-mono ${
                  p.clinical.mrd_d29<0.01?"text-emerald-400"
                  :p.clinical.mrd_d29<0.1?"text-amber-400":"text-red-400"}`}>
                  {p.clinical.mrd_d29.toFixed(2)}%
                </p>
              )}
              {/* İlaç mini-dots */}
              <div className="flex gap-0.5 justify-center flex-wrap">
                {[["dose_6mp_mg","6mp"],["dose_mtx_mg","mtx"],["dose_vcr_mg","vcr"],
                  ["dose_dnr_mg_m2","daunorubicin"],["peg_dose_per_m2","asparaginase"]].map(([field,key])=>(
                  p.clinical?.[field]?<div key={key} className="w-1.5 h-1.5 rounded-full"
                    style={{background:DRUG_PALETTE[key]?.color||"#6b7280"}} title={DRUG_PALETTE[key]?.label||key}/>:null
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GAN Klinik Özet
// ══════════════════════════════════════════════════════════════════════════════

// ── GAN XAI Paneli ──────────────────────────────────────────────────────────
const RISK_COLORS_UC = {
  LR:  { dark: "#22c55e", light: "#16a34a" },
  SR:  { dark: "#3b82f6", light: "#2563eb" },
  IR:  { dark: "#f59e0b", light: "#d97706" },
  HR:  { dark: "#f97316", light: "#ea580c" },
  VHR: { dark: "#ef4444", light: "#dc2626" },
};

const CF_RISK_TARGETS = ["LR","SR","IR","HR","VHR"];

const RISK_FULL_LABEL = {
  LR:  { tr: "Düşük Risk (LR)",       en: "Low Risk (LR)" },
  SR:  { tr: "Standart Risk (SR)",    en: "Standard Risk (SR)" },
  IR:  { tr: "Orta Risk (IR)",        en: "Intermediate Risk (IR)" },
  HR:  { tr: "Yüksek Risk (HR)",      en: "High Risk (HR)" },
  VHR: { tr: "Çok Yüksek Risk (VHR)","en": "Very High Risk (VHR)" },
};

function GANXAIPanel({ dark, isEN, patients }) {
  const d = dark;
  const BASE = "/api/v1";
  const getToken = () => localStorage.getItem("sting_token");

  const [result,    setResult]    = useState(null);
  const [status,    setStatus]    = useState("idle");
  const [error,     setError]     = useState(null);
  const [cfTarget,  setCfTarget]  = useState("SR");
  const [selectedPt, setSelectedPt] = useState(null);
  const [ptListOpen, setPtListOpen] = useState(false);
  const [open,       setOpen]       = useState(true);

  const handleSelectPt = (pt) => {
    setSelectedPt(pt);
    setPtListOpen(false);
    setResult(null);
    setStatus("idle");
    setError(null);
  };

  const run = async () => {
    if (!selectedPt) return;
    const ex = selectedPt.extrinsic || {};
    const cl = selectedPt.clinical  || {};
    const payload = {
      pat_age_y:           cl.age              ?? 8,
      pat_sex:             cl.sex              ?? "M",
      pat_wbc_diag:        ex.pat_wbc_diag     ?? cl.wbc0 ?? 45,
      pat_all_subtype:     ex.pat_all_subtype  ?? "B-ALL",
      pat_cns_status:      ex.pat_cns_status   ?? "CNS1",
      pat_testis_inv:      ex.pat_testis_inv   ?? 0,
      gen_etv6_runx1:      ex.gen_etv6_runx1   ?? 0,
      gen_high_hyperdip:   ex.gen_high_hyperdip ?? 0,
      gen_bcr_abl1:        ex.gen_bcr_abl1     ?? 0,
      gen_ph_like:         ex.gen_ph_like      ?? 0,
      gen_ikzf1_del:       ex.gen_ikzf1_del    ?? 0,
      gen_kmt2a_r:         ex.gen_kmt2a_r      ?? 0,
      gen_hypodiploidy:    ex.gen_hypodiploidy ?? 0,
      gen_iamp21:          ex.gen_iamp21       ?? 0,
      resp_steroid_d8_pgr: ex.resp_steroid_d8_pgr ?? 1,
      resp_mrd_d29_pct:    ex.resp_mrd_d29_pct ?? cl.mrd_d29 ?? 0.01,
      resp_bm_d15_morph:   ex.resp_bm_d15_morph ?? "M1",
      resp_eoc_mrd_pct:    ex.resp_eoc_mrd_pct ?? cl.mrd_eoc ?? 0.001,
      phg_tpmt_status:     ex.phg_tpmt_status  ?? "normal",
      phg_nudt15_r139c:    ex.phg_nudt15_r139c ?? 0,
      cf_target_class:     cfTarget,
      cf_max_steps:        30,
    };
    setStatus("running"); setError(null);
    try {
      const res  = await fetch(`${BASE}/gan/xai/counterfactual`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Hata");
      setResult(data); setStatus("done");
    } catch(e) {
      setError(e.message); setStatus("error");
    }
  };

  // Risk sınıfı rengi
  const rc = (cls) => RISK_COLORS_UC[cls]?.[d?"dark":"light"] ?? "#6b7280";

  // İnsan okunabilir değişiklik açıklaması
  const changeDesc = (feat, orig, cf) => {
    const labels = {
      resp_mrd_d29_pct:    isEN ? "MRD at Day 29" : "Gün 29 MRD'si",
      resp_eoc_mrd_pct:    isEN ? "End-of-induction MRD" : "İndüksiyon sonu MRD",
      resp_steroid_d8_pgr: isEN ? "Day 8 steroid response" : "Gün 8 steroid yanıtı",
      resp_bm_d15_morph:   isEN ? "Day 15 bone marrow morphology" : "Gün 15 kemik iliği morfolojisi",
      pat_wbc_diag:        isEN ? "WBC count at diagnosis" : "Tanıda WBC sayısı",
      pat_cns_status:      isEN ? "CNS involvement status" : "CNS tutulum durumu",
      pat_age_y:           isEN ? "Patient age" : "Hasta yaşı",
    };
    const lbl = labels[feat] || feat;
    const origStr = feat === "resp_steroid_d8_pgr"
      ? (String(orig) === "True" || orig === true ? (isEN?"good responder (PGR)":"iyi yanıtlayıcı (PGR)") : (isEN?"poor responder (PPR)":"kötü yanıtlayıcı (PPR)"))
      : String(orig);
    const cfStr = feat === "resp_steroid_d8_pgr"
      ? (String(cf) === "True" || cf === true ? (isEN?"good responder (PGR)":"iyi yanıtlayıcı (PGR)") : (isEN?"poor responder (PPR)":"kötü yanıtlayıcı (PPR)"))
      : String(cf);
    return { lbl, origStr, cfStr };
  };

  if (!patients?.length) return null;

  const ptRC = selectedPt ? (selectedPt.risk_class||"").toUpperCase() : null;

  return (
    <div className={`rounded-2xl border overflow-hidden ${d?"border-rose-900/30":"border-rose-200"}`}>

      {/* ── Başlık ── */}
      <button onClick={() => setOpen(o=>!o)}
        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${
          d?"bg-rose-950/30 hover:bg-rose-950/50":"bg-rose-50 hover:bg-rose-100"}`}>
        <div className="flex items-center gap-3">
          <svg className={`w-5 h-5 flex-shrink-0 ${d?"text-rose-400":"text-rose-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div>
            <p className={`text-sm font-bold ${d?"text-rose-300":"text-rose-700"}`}>
              {isEN?"Counterfactual Analysis (XAI)":"Counterfactual Analizi (XAI)"}
            </p>
            <p className={`text-xs ${d?"text-rose-400/70":"text-rose-500"}`}>
              {isEN
                ? "What would need to change for this patient to reach a different risk class?"
                : "Bu hastanın farklı bir risk sınıfına ulaşması için ne değişmeli?"}
            </p>
          </div>
        </div>
        <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${open?"rotate-180":""} ${d?"text-rose-400":"text-rose-500"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {open && (
        <div className={`p-5 space-y-5 ${d?"bg-slate-900":"bg-white"}`}>

          {/* Açıklama */}
          <p className={`text-xs leading-relaxed ${d?"text-slate-400":"text-slate-500"}`}>
            {isEN
              ? 'Counterfactual XAI: what clinical changes would move this patient to a different risk class? Validates the GAN model and informs treatment decisions.'
              : 'Counterfactual XAI: bu hastanın hangi klinik değerleri değişseydi risk sınıfı farklı olurdu? GAN modelini doğrular ve tedavi kararlarını destekler.'}
          </p>

          {/* ── Hasta Seçici ── */}
          <div className={`rounded-xl border overflow-hidden ${d?"border-slate-700":"border-slate-200"}`}>
            <button onClick={() => setPtListOpen(o=>!o)}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                d?"bg-slate-800 hover:bg-slate-700":"bg-slate-50 hover:bg-slate-100"}`}>
              <div className="flex items-center gap-2 min-w-0">
                <svg className={`w-4 h-4 flex-shrink-0 ${d?"text-slate-400":"text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${d?"text-slate-300":"text-slate-600"}`}>
                    {isEN?"Select patient to analyse":"Analiz edilecek hasta"}
                  </p>
                  {selectedPt ? (
                    <p className="text-xs">
                      <span className={d?"text-slate-400":"text-slate-500"}>{selectedPt.patient_id} · </span>
                      <span className="font-bold" style={{color: rc(ptRC)}}>
                        {isEN ? RISK_FULL_LABEL[ptRC]?.en : RISK_FULL_LABEL[ptRC]?.tr}
                      </span>
                    </p>
                  ) : (
                    <p className={`text-xs ${d?"text-amber-400":"text-amber-600"}`}>
                      {isEN?"No patient selected":"Hasta seçilmedi"}
                    </p>
                  )}
                </div>
              </div>
              <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${ptListOpen?"rotate-180":""} ${d?"text-slate-500":"text-slate-400"}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            {ptListOpen && (
              <div className={`max-h-56 overflow-y-auto ${d?"bg-slate-900":"bg-white"}`}>
                {patients.map((pt, i) => {
                  const prc = (pt.risk_class||"ir").toUpperCase();
                  const col = rc(prc);
                  const isSel = selectedPt?.patient_id === pt.patient_id;
                  return (
                    <button key={i} onClick={() => handleSelectPt(pt)}
                      className={`w-full text-left px-4 py-2.5 text-xs transition-colors border-b last:border-b-0 ${
                        isSel
                          ? d?"bg-rose-900/30 border-rose-800/40":"bg-rose-50 border-rose-200"
                          : d?"border-slate-800 hover:bg-slate-800":"border-slate-100 hover:bg-slate-50"}`}>
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold ${d?"text-slate-200":"text-slate-700"}`}>{pt.patient_id}</span>
                        <span className="font-bold text-xs px-2 py-0.5 rounded" style={{background:`${col}20`,color:col}}>{prc}</span>
                      </div>
                      <p className={`text-xs mt-0.5 ${d?"text-slate-500":"text-slate-400"}`}>
                        {isEN ? RISK_FULL_LABEL[prc]?.en : RISK_FULL_LABEL[prc]?.tr}
                        {pt.clinical?.age ? ` · ${pt.clinical.age}y` : ""}
                        {pt.clinical?.sex ? ` · ${pt.clinical.sex}` : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Hedef sınıf + Çalıştır ── */}
          {selectedPt && (
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className={`text-xs font-semibold mb-1.5 ${d?"text-slate-400":"text-slate-600"}`}>
                  {isEN?"Counterfactual target — select target class below:":"Hedef sınıf seçin:"}
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {CF_RISK_TARGETS.filter(cls => cls !== ptRC).map(cls => {
                    const col = rc(cls);
                    const isSel = cfTarget === cls;
                    return (
                      <button key={cls} onClick={() => { setCfTarget(cls); setResult(null); setStatus("idle"); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          isSel ? "text-white border-transparent" : d?"border-slate-700 text-slate-400 hover:border-slate-500":"border-slate-200 text-slate-500 hover:border-slate-300"}`}
                        style={isSel ? {background:col} : {}}>
                        {isEN ? RISK_FULL_LABEL[cls]?.en : RISK_FULL_LABEL[cls]?.tr}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button onClick={run} disabled={status==="running"}
                className={`mt-4 self-end px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                  status==="running"
                    ? d?"bg-slate-700 text-slate-400 cursor-wait":"bg-slate-200 text-slate-400 cursor-wait"
                    : d?"bg-rose-700 hover:bg-rose-600 text-white shadow-lg shadow-rose-900/30"
                        :"bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-200"}`}>
                {status==="running"
                  ? <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      {isEN?"Analysing…":"Analiz ediliyor…"}
                    </span>
                  : status==="done"
                    ? isEN?"↺ Re-run":"↺ Tekrar Çalıştır"
                    : isEN?"▶ Run Analysis":"▶ Analizi Başlat"}
              </button>
            </div>
          )}

          {/* Hata */}
          {error && (
            <div className={`rounded-xl border px-4 py-3 text-xs ${d?"border-red-800 bg-red-900/20 text-red-400":"border-red-200 bg-red-50 text-red-600"}`}>
              ⚠ {error}
            </div>
          )}

          {/* ── Sonuç ── */}
          {result && status==="done" && (() => {
            const baseCol = rc(result.baseline_class);
            const targCol = rc(result.target_class);
            const finCol  = rc(result.final_class);
            const baseLbl = isEN ? RISK_FULL_LABEL[result.baseline_class]?.en : RISK_FULL_LABEL[result.baseline_class]?.tr;
            const targLbl = isEN ? RISK_FULL_LABEL[result.target_class]?.en  : RISK_FULL_LABEL[result.target_class]?.tr;
            const finLbl  = isEN ? RISK_FULL_LABEL[result.final_class]?.en   : RISK_FULL_LABEL[result.final_class]?.tr;

            return (
              <div className={`rounded-xl border p-4 space-y-4 ${d?"border-slate-700 bg-slate-800/50":"border-slate-200 bg-slate-50"}`}>

                {/* Ana soru & özet cümle */}
                <div>
                  <p className={`text-xs font-semibold mb-2 ${d?"text-slate-300":"text-slate-700"}`}>
                    {isEN?"Counterfactual question:":"Counterfactual sorusu:"}
                  </p>
                  <p className={`text-sm leading-relaxed ${d?"text-slate-200":"text-slate-800"}`}>
                    {isEN
                      ? <>Patient <span className="font-bold">{result.baseline_class === "already_satisfied" ? result.target_class : result.baseline_class}</span> (<span style={{color:baseCol}}>{baseLbl}</span>) — what clinical changes would bring this patient to <span className="font-bold" style={{color:targCol}}>{targLbl}</span>?</>
                      : <><span className="font-bold" style={{color:baseCol}}>{baseLbl}</span> olan bu hasta, <span className="font-bold" style={{color:targCol}}>{targLbl}</span> sınıfına ulaşmak için hangi klinik değişimlere ihtiyaç duyuyor?</>
                    }
                  </p>
                </div>

                {/* Zaten hedefteyse */}
                {result.already_satisfied && (
                  <div className={`rounded-lg px-4 py-2.5 text-sm ${d?"bg-blue-900/20 text-blue-300":"bg-blue-50 text-blue-700"}`}>
                    ✓ {isEN?"This patient is already in the target class.":"Bu hasta zaten hedef sınıfta."}
                  </div>
                )}

                {/* Başarılı — ne değişti */}
                {result.goal_reached && !result.already_satisfied && (
                  <div className="space-y-3">
                    <div className={`rounded-lg px-4 py-2.5 ${d?"bg-emerald-900/20":"bg-emerald-50"}`}>
                      <p className={`text-xs font-semibold mb-1 ${d?"text-emerald-300":"text-emerald-700"}`}>
                        ✓ {isEN?"Counterfactual found — the following changes would move this patient to ":"Counterfactual bulundu — şu değişiklikler bu hastayı "}
                        <span style={{color:targCol}}>{targLbl}</span>
                        {isEN?" class:":" sınıfına taşır:"}
                      </p>
                    </div>
                    {result.changed_features?.map((cf, i) => {
                      const d2 = changeDesc(cf.feature, cf.original, cf.counterfactual);
                      return (
                        <div key={i} className={`flex items-start gap-3 rounded-lg px-4 py-3 ${d?"bg-slate-700/50":"bg-white border border-slate-200"}`}>
                          <span className="text-emerald-400 font-bold flex-shrink-0 mt-0.5">→</span>
                          <div>
                            <p className={`text-sm font-semibold ${d?"text-slate-200":"text-slate-700"}`}>{d2.lbl}</p>
                            <p className={`text-xs mt-0.5 ${d?"text-slate-400":"text-slate-500"}`}>
                              {isEN?"Currently":"Şu an"}: <span className={d?"text-slate-300":"text-slate-600"}>{d2.origStr}</span>
                              {" → "}
                              {isEN?"needs to be":"olması gerekir"}: <span className="font-bold text-emerald-400">{d2.cfStr}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {/* Sınıf seyri */}
                    {result.class_history?.length > 1 && (
                      <div>
                        <p className={`text-xs ${d?"text-slate-500":"text-slate-400"} mb-1.5`}>
                          {isEN?"Step-by-step risk class trajectory:":"Adım adım risk sınıfı değişimi:"}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {result.class_history.map((cls, i) => (
                            <span key={i} className="flex items-center gap-1.5">
                              <span className="px-2.5 py-1 rounded-lg text-xs font-bold"
                                style={{background:`${rc(cls)}20`, color:rc(cls), border:`1px solid ${rc(cls)}40`}}>
                                {isEN ? RISK_FULL_LABEL[cls]?.en : RISK_FULL_LABEL[cls]?.tr}
                              </span>
                              {i < result.class_history.length-1 &&
                                <span className={`text-sm ${d?"text-slate-500":"text-slate-300"}`}>→</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* GAN güvenilirlik yorumu */}
                    <div className={`rounded-lg px-4 py-3 text-xs leading-relaxed ${d?"bg-indigo-900/20 border border-indigo-800/40 text-indigo-300":"bg-indigo-50 border border-indigo-200 text-indigo-700"}`}>
                      <p className="font-semibold mb-1">
                        💡 {isEN?"What this tells us about the GAN model:":"GAN modeli hakkında ne söylüyor:"}
                      </p>
                      <p>
                        {isEN
                          ? `The synthetic patient responded to clinically meaningful changes — the model has captured realistic risk dynamics. Moving from ${baseLbl} to ${targLbl} required changes in treatment response markers, consistent with established clinical criteria.`
                          : `Sentetik hasta klinik açıdan anlamlı değişimlere gerçekçi biçimde yanıt verdi — model, gerçek risk dinamiklerini öğrenmiş. ${baseLbl} → ${targLbl} geçişi tedavi yanıt göstergelerinde değişiklik gerektirdi; bu, yerleşik klinik kriterlerle tutarlı.`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Başarısız — neden */}
                {!result.goal_reached && !result.already_satisfied && (
                  <div className="space-y-3">
                    <div className={`rounded-lg px-4 py-3 ${d?"bg-amber-900/20 border border-amber-800/40":"bg-amber-50 border border-amber-200"}`}>
                      <p className={`text-xs font-semibold mb-1.5 ${d?"text-amber-300":"text-amber-800"}`}>
                        ⚠ {isEN
                          ? `This patient cannot reach ${targLbl} through clinical interventions alone`
                          : `Bu hasta yalnızca klinik müdahalelerle ${targLbl} sınıfına ulaşamıyor`}
                      </p>
                      <p className={`text-xs leading-relaxed ${d?"text-amber-200/80":"text-amber-700"}`}>
                        {result.impossible_reason || (isEN
                          ? "The risk class is determined by fixed factors (genetic markers) that cannot be changed through clinical intervention."
                          : "Risk sınıfı, klinik müdahale ile değiştirilemeyen sabit faktörler (genetik markörler) tarafından belirleniyor.")}
                      </p>
                    </div>
                    {/* Kısmi ilerleme varsa göster */}
                    {result.changed_features?.length > 0 && (
                      <div>
                        <p className={`text-xs font-semibold mb-2 ${d?"text-slate-400":"text-slate-600"}`}>
                          {isEN?"Partial progress — changes that moved closer to target:":"Kısmi ilerleme — hedefe yaklaştıran değişiklikler:"}
                        </p>
                        {result.changed_features.map((cf, i) => {
                          const d2 = changeDesc(cf.feature, cf.original, cf.counterfactual);
                          return (
                            <div key={i} className={`flex items-start gap-3 rounded-lg px-4 py-2.5 mb-2 ${d?"bg-slate-700/50":"bg-white border border-slate-200"}`}>
                              <span className={`font-bold flex-shrink-0 mt-0.5 ${d?"text-amber-400":"text-amber-500"}`}>→</span>
                              <div>
                                <p className={`text-xs font-semibold ${d?"text-slate-200":"text-slate-700"}`}>{d2.lbl}</p>
                                <p className={`text-xs mt-0.5 ${d?"text-slate-400":"text-slate-500"}`}>
                                  {d2.origStr} → <span className="font-bold text-amber-400">{d2.cfStr}</span>
                                  {" "}({isEN?"moved to":"ulaşılan"}: <span style={{color:rc(result.final_class)}}>{finLbl}</span>)
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* GAN güvenilirlik yorumu — başarısız durum */}
                    <div className={`rounded-lg px-4 py-3 text-xs leading-relaxed ${d?"bg-indigo-900/20 border border-indigo-800/40 text-indigo-300":"bg-indigo-50 border border-indigo-200 text-indigo-700"}`}>
                      <p className="font-semibold mb-1">
                        💡 {isEN?"What this tells us about the GAN model:":"GAN modeli hakkında ne söylüyor:"}
                      </p>
                      <p>
                        {isEN
                          ? `The model correctly reflects that ${targLbl} classification requires favorable genetic markers (e.g. ETV6-RUNX1, high hyperdiploidy) that cannot be achieved through treatment. This is clinically appropriate — the GAN has learned that risk stratification is not solely determined by modifiable factors.`
                          : `Model, ${targLbl} sınıflandırmasının tedaviyle kazanılamayan favorable genetik markörler (ETV6-RUNX1, yüksek hiperdiplodi gibi) gerektirdiğini doğru biçimde yansıtıyor. Bu klinik açıdan doğru — GAN, risk stratifikasyonunun yalnızca değiştirilebilir faktörlere bağlı olmadığını öğrenmiş.`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Boş durum */}
          {status==="idle" && !selectedPt && (
            <p className={`text-xs text-center py-4 ${d?"text-slate-600":"text-slate-400"}`}>
              {isEN?"Select a synthetic patient above to begin.":"Başlamak için yukarıdan bir sentetik hasta seçin."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}



// ── Yeniden Konumlandırma Senaryosu Paneli ──────────────────────────────────
function RepoScenarioPanel({ dark, isEN, jobId }) {
  const d = dark;
  const BASE = "/api/v1";
  const getToken = () => localStorage.getItem("sting_token");

  const [status,   setStatus]   = useState("idle"); // idle|running|done|error
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);
  const [open,     setOpen]     = useState(false);
  const [copDose,  setCopDose]  = useState(60);
  const [novDose,  setNovDose]  = useState(10);

  const run = async () => {
    setStatus("running"); setError(null); setResult(null);
    try {
      const res = await fetch(`${BASE}/gan/v2/repo_scenario`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          gan_v2_job_id:  jobId,
          dose_cop_mg:    copDose,
          dose_nov_mg_kg: novDose,
          n_days:         250,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Senaryo hatası");
      setResult(data);
      setStatus("done");
      setOpen(true);
    } catch(e) {
      setError(e.message);
      setStatus("error");
    }
  };

  const RISK_COL = { LR:"#22c55e", SR:"#3b82f6", IR:"#f59e0b", HR:"#f97316", VHR:"#ef4444" };

  return (
    <div className={`rounded-2xl border overflow-hidden ${d?"border-teal-900/40":"border-teal-200"}`}>
      {/* Başlık */}
      <div className={`flex items-center justify-between px-5 py-4 ${d?"bg-teal-950/30":"bg-teal-50"}`}>
        <div className="flex items-center gap-3">
          <svg className={`w-5 h-5 flex-shrink-0 ${d?"text-teal-400":"text-teal-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 0010 10.172V5L8 4z"/>
          </svg>
          <div>
            <p className={`text-sm font-bold ${d?"text-teal-300":"text-teal-800"}`}>
              {isEN?"Repositioning Scenario (NOV + COP)":"Yeniden Konumlandırma Senaryosu (NOV + COP)"}
            </p>
            <p className={`text-xs ${d?"text-teal-400/70":"text-teal-600"}`}>
              {isEN
                ? "Re-runs ODE for each synthetic patient with Copanlisib + Novobiocin added"
                : "Her sentetik hasta için Copanlisib + Novobiocin eklenerek ODE yeniden koşulur"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status==="done" && (
            <button onClick={() => setOpen(o=>!o)}
              className={`text-xs px-2 py-1 rounded-lg ${d?"bg-teal-900/40 text-teal-300":"bg-teal-100 text-teal-700"}`}>
              {open?(isEN?"Hide":"Gizle"):(isEN?"Show":"Göster")}
            </button>
          )}
          <button onClick={run} disabled={status==="running"}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              status==="running"
                ? d?"bg-slate-700 text-slate-400 cursor-wait":"bg-slate-200 text-slate-400 cursor-wait"
                : d?"bg-teal-700 hover:bg-teal-600 text-white":"bg-teal-600 hover:bg-teal-700 text-white"
            }`}>
            {status==="running"
              ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>{isEN?"Running…":"Çalışıyor…"}</>
              : status==="done" ? (isEN?"↺ Re-run":"↺ Tekrar") : (isEN?"▶ Run Scenario":"▶ Senaryoyu Çalıştır")}
          </button>
        </div>
      </div>

      {/* Doz ayarları */}
      <div className={`px-5 py-3 flex flex-wrap gap-4 items-center border-b ${d?"border-teal-900/30 bg-teal-950/10":"border-teal-100 bg-white"}`}>
        <div className="flex items-center gap-2">
          <label className={`text-xs font-semibold ${d?"text-teal-400":"text-teal-700"}`}>
            {isEN?"Copanlisib dose (mg):":"Copanlisib dozu (mg):"}
          </label>
          <input type="number" value={copDose} onChange={e=>setCopDose(Number(e.target.value))}
            min="10" max="200" step="10"
            className={`w-20 text-xs px-2 py-1 rounded-lg border text-center font-mono ${d?"bg-slate-800 border-slate-600 text-slate-200":"bg-white border-slate-300 text-slate-700"}`}/>
        </div>
        <div className="flex items-center gap-2">
          <label className={`text-xs font-semibold ${d?"text-teal-400":"text-teal-700"}`}>
            {isEN?"Novobiocin dose (mg/kg):":"Novobiocin dozu (mg/kg):"}
          </label>
          <input type="number" value={novDose} onChange={e=>setNovDose(Number(e.target.value))}
            min="1" max="50" step="1"
            className={`w-20 text-xs px-2 py-1 rounded-lg border text-center font-mono ${d?"bg-slate-800 border-slate-600 text-slate-200":"bg-white border-slate-300 text-slate-700"}`}/>
        </div>
        <p className={`text-xs ${d?"text-slate-500":"text-slate-400"}`}>
          {isEN
            ? "⚠ GNN validation is approximate"
            : "⚠ GNN doğrulaması yaklaşıktır"}
        </p>
      </div>

      {/* Hata */}
      {error && (
        <div className={`px-5 py-3 text-xs ${d?"bg-red-900/20 text-red-400":"bg-red-50 text-red-600"}`}>
          ⚠ {error}
        </div>
      )}

      {/* Sonuç */}
      {result && status==="done" && open && (
        <div className={`p-5 space-y-4 ${d?"bg-slate-900":"bg-white"}`}>
          {/* Özet */}
          <div className="flex flex-wrap gap-2">
            {[
              {l:isEN?"Patients":"Hastalar",    v:result.n_patients},
              {l:isEN?"ODE Success":"ODE Başarılı", v:result.n_ok, col:"#22c55e"},
              {l:isEN?"GNN Validated":"GNN Doğrulanan", v:result.n_gnn_ok, col:"#3b82f6"},
              {l:"Copanlisib",  v:`${result.dose_cop_mg} mg`},
              {l:"Novobiocin",  v:`${result.dose_nov_mg_kg} mg/kg`},
            ].map((c,i)=>(
              <div key={i} className={`rounded-xl border px-3 py-1.5 text-center ${d?"border-slate-700 bg-slate-800":"border-slate-200 bg-slate-50"}`}>
                <p className={`text-xs ${d?"text-slate-500":"text-slate-400"}`}>{c.l}</p>
                <p className="text-sm font-bold font-mono" style={{color:c.col??(d?"#e2e8f0":"#1e293b")}}>{c.v}</p>
              </div>
            ))}
          </div>

          {/* Açıklama notu */}
          <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${d?"border-teal-800/40 bg-teal-900/20 text-teal-300":"border-teal-200 bg-teal-50 text-teal-800"}`}>
            <p className="font-semibold mb-1">
              💡 {isEN?"What this scenario shows:":"Bu senaryo ne gösteriyor:"}
            </p>
            <p>
              {isEN
                ? `Each synthetic patient's ODE was re-run with Copanlisib (${result.dose_cop_mg} mg) and Novobiocin (${result.dose_nov_mg_kg} mg/kg) added to the standard protocol.`
                : `Her sentetik hastanın ODE'si standart protokole Copanlisib (${result.dose_cop_mg} mg) ve Novobiocin (${result.dose_nov_mg_kg} mg/kg) eklenerek yeniden koşuldu.`}
            </p>
          </div>

          {/* Kohort düzeyi karşılaştırma */}
          {(()=>{
            const pts = result.patients || [];
            const ok  = pts.filter(p=>p.repo_ok);
            if(!ok.length) return null;

            const mean = arr => arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : null;
            const fmt  = (v,dec=3) => v!=null ? v.toFixed(dec) : "—";

            const base_lt  = mean(ok.map(p=>p.summary_base?.Lt_final).filter(v=>v!=null));
            const repo_lt  = mean(ok.map(p=>p.summary_repo?.Lt_final).filter(v=>v!=null));
            const base_wbc = mean(ok.map(p=>p.summary_base?.wbc_min).filter(v=>v!=null));
            const repo_wbc = mean(ok.map(p=>p.summary_repo?.wbc_min).filter(v=>v!=null));
            const base_vipn= mean(ok.map(p=>p.summary_base?.vipn_min).filter(v=>v!=null));
            const repo_vipn= mean(ok.map(p=>p.summary_repo?.vipn_min).filter(v=>v!=null));
            const repo_lt_max = mean(ok.map(p=>p.summary_repo?.Lt_max).filter(v=>v!=null));

            const delta = (b,r) => b!=null&&r!=null ? ((r-b)/Math.max(Math.abs(b),1e-9)*100).toFixed(1) : null;
            const arrow = (b,r,lowerBetter) => {
              if(b==null||r==null) return "";
              const d = r - b;
              if(Math.abs(d)<0.0001) return "→";
              const better = lowerBetter ? d<0 : d>0;
              return better ? "▼ iyileşti" : "▲ kötüleşti";
            };

            return (
              <div className="space-y-3">
                <p className={`text-xs font-bold ${d?"text-slate-300":"text-slate-700"}`}>
                  📊 {isEN?"Cohort-level comparison (mean, n="+ok.length+")":"Kohort düzey karşılaştırma (ortalama, n="+ok.length+")"}
                </p>

                {/* Karşılaştırma tablosu */}
                <div className={`rounded-xl border overflow-hidden ${d?"border-slate-700":"border-slate-200"}`}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className={d?"bg-slate-800 text-slate-400":"bg-slate-100 text-slate-500"}>
                        <th className="text-left px-3 py-2">{isEN?"Metric":"Metrik"}</th>
                        <th className="text-center px-3 py-2">{isEN?"Standard":"Standart"}</th>
                        <th className="text-center px-3 py-2">+COP+NOV</th>
                        <th className="text-center px-3 py-2">{isEN?"Change":"Değişim"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {l:"Lt final (tümör yükü)", b:base_lt, r:repo_lt, lower:true, dec:4},
                        {l:"Lt max (pik yük)",      b:null,    r:repo_lt_max, lower:true, dec:4},
                        {l:"WBC min (G/L)",          b:base_wbc,r:repo_wbc, lower:false, dec:3},
                        {l:"VIPN min",               b:base_vipn,r:repo_vipn,lower:false, dec:3},
                      ].map((row,i)=>{
                        const d2 = delta(row.b, row.r);
                        const ar = arrow(row.b, row.r, row.lower);
                        const col = ar.includes("iyileşti")?"#22c55e":ar.includes("kötüleşti")?"#ef4444":"#94a3b8";
                        return (
                          <tr key={i} className={i%2===0?(d?"bg-slate-900":"bg-white"):(d?"bg-slate-800/50":"bg-slate-50")}>
                            <td className={`px-3 py-2 font-medium ${d?"text-slate-300":"text-slate-700"}`}>{row.l}</td>
                            <td className={`px-3 py-2 text-center font-mono ${d?"text-slate-400":"text-slate-500"}`}>{fmt(row.b,row.dec)}</td>
                            <td className={`px-3 py-2 text-center font-mono font-bold ${d?"text-teal-300":"text-teal-700"}`}>{fmt(row.r,row.dec)}</td>
                            <td className="px-3 py-2 text-center">
                              {d2!=null&&<span className="font-semibold" style={{color:col}}>%{d2} {ar}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Hasta bazlı özet */}
                <p className={`text-xs font-bold ${d?"text-slate-300":"text-slate-700"}`}>
                  👤 {isEN?"Per-patient summary":"Hasta bazlı özet"}
                </p>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {ok.map(p=>{
                    const rc = (p.risk_class||"ir").toLowerCase();
                    const rcCol = {lr:"#22c55e",sr:"#3b82f6",ir:"#f59e0b",hr:"#f97316",vhr:"#ef4444"}[rc]||"#94a3b8";
                    const lt_b = p.summary_base?.Lt_final;
                    const lt_r = p.summary_repo?.Lt_final;
                    const imp  = lt_b!=null&&lt_r!=null&&lt_r<lt_b;
                    const gnn  = p.gnn_repo;
                    return (
                      <div key={p.patient_id} className={`rounded-lg px-3 py-2 border text-xs flex items-center justify-between gap-2 ${d?"bg-slate-800 border-slate-700":"bg-slate-50 border-slate-200"}`}>
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono" style={{color:rcCol}}>{(p.risk_class||"?").toUpperCase()}</span>
                          <span className={d?"text-slate-400":"text-slate-500"}>{p.patient_id}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono">
                          <span className={d?"text-slate-500":"text-slate-400"}>
                            Lt: {lt_b!=null?lt_b.toFixed(4):"—"} → <span style={{color:imp?"#22c55e":"#ef4444"}}>{lt_r!=null?lt_r.toFixed(4):"—"}</span>
                          </span>
                          <span className={d?"text-slate-500":"text-slate-400"}>
                            WBC↓: {p.summary_repo?.wbc_min?.toFixed(2)??"—"}
                          </span>
                          {gnn&&!gnn.error&&(
                            <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${gnn.quality==="good"?(d?"bg-emerald-900/40 text-emerald-400":"bg-emerald-100 text-emerald-700"):(d?"bg-amber-900/40 text-amber-400":"bg-amber-100 text-amber-700")}`}>
                              GNN {gnn.quality==="good"?"✓":"~"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function GANSummary({ patients, dark, isEN, schema, onExport }) {
  const d=dark;
  if(!patients?.length) return null;

  const cnt={lr:0,sr:0,ir:0,hr:0,vhr:0};
  patients.forEach(p=>{const rc=p.risk_class||"sr"; cnt[rc]=(cnt[rc]||0)+1;});
  const totalRisk=patients.length;

  const avg=(fn)=>{
    const v=patients.map(fn).filter(x=>x!=null&&!isNaN(x));
    return v.length?v.reduce((s,x)=>s+x,0)/v.length:null;
  };
  const avgExtRisk=avg(p=>p.extrinsic_risk_score);
  const avgWbc=avg(p=>p.summary?.wbc_min);
  const avgAnc=avg(p=>p.summary?.anc_min);

  // Ekstrinsik faktör ortalamaları
  const extAvgs={};
  (schema||[]).forEach(ef=>{
    extAvgs[ef.id]=avg(p=>p.extrinsic?.[ef.id]);
  });

  const findings=[];
  const vhrCnt=(cnt.vhr||0), hrCnt=(cnt.hr||0), lrCnt=(cnt.lr||0);
  // VHR uyarıları
  if(vhrCnt>0) findings.push({level:"critical",text:isEN
    ?`${vhrCnt} patient(s) in VHR class. These have very adverse genomics (BCR-ABL1, KMT2A-r, hypodiploidy) or induction failure/MRD≥1%. Targeted therapy or HSCT/CAR-T evaluation recommended.`
    :`${vhrCnt} hasta VHR sınıfında. Çok kötü genomik (BCR-ABL1, KMT2A-r, hipodiploidi) veya indüksiyon başarısızlığı/MRD≥%1 içeriyor. Hedefe yönelik tedavi veya HSCT/CAR-T değerlendirmesi önerilir.`});
  // HR uyarıları
  if(hrCnt>0) findings.push({level:"warn",text:isEN
    ?`${hrCnt} patient(s) classified HR. Adverse genomics, CNS3/testicular involvement, PPR, or persistent MRD≥0.1% detected. Post-induction intensification protocol required.`
    :`${hrCnt} hasta HR sınıfında. Adverse genomik, CNS3/testis tutulumu, PPR veya kalıcı MRD≥%0.1 saptandı. İndüksiyon sonrası yoğunlaştırma protokolü gerekli.`});
  // MRD uyarısı
  const highMrdPct=patients.filter(p=>(p.extrinsic?.mrd_eoi||0)>=0.67).length;
  if(highMrdPct>0) findings.push({level:"warn",text:isEN
    ?`${highMrdPct} patient(s) with MRD≥0.1% at end of induction. MRD is the strongest independent predictor of relapse (Berry et al. 2017, JAMA Oncology). Escalation to HR/VHR protocol should be considered.`
    :`${highMrdPct} hastada indüksiyon sonu MRD≥%0.1. MRD, nüksün en güçlü bağımsız belirleyicisidir (Berry et al. 2017, JAMA Oncology). HR/VHR protokolüne geçiş değerlendirilmeli.`});
  // CNS3 uyarısı
  const cns3Pct=patients.filter(p=>(p.extrinsic?.cns_status||0)>=1.0).length;
  if(cns3Pct>0) findings.push({level:"warn",text:isEN
    ?`${cns3Pct} patient(s) with CNS3 status. CNS sanctuary site involvement independently reduces EFS and requires intensive intrathecal therapy (Jastaniah et al. 2015).`
    :`${cns3Pct} hastada CNS3 durumu. SSS tutulumu EFS'yi bağımsız olarak düşürür ve yoğun intratekal tedavi gerektirir (Jastaniah et al. 2015).`});
  // Düşük SES
  const lowSes=patients.filter(p=>(p.extrinsic?.ses_index||1)<0.3).length;
  if(lowSes>0) findings.push({level:"info",text:isEN
    ?`${lowSes} patient(s) with low socioeconomic status. SES affects treatment access and adherence in pediatric ALL (Öztürk et al. 2021, Clinical Lymphoma Myeloma Leukemia).`
    :`${lowSes} hastada düşük sosyoekonomik durum. SES, pediatrik ALL'de tedavi erişimini ve uyumu etkiler (Öztürk et al. 2021, Clinical Lymphoma Myeloma Leukemia).`});
  // Olumlu durum
  if(lrCnt>0) findings.push({level:"good",text:isEN
    ?`${lrCnt} patient(s) in LR class (age 1–10y, WBC<50, favorable genomics, MRD<0.01%). De-intensification of therapy may be feasible.`
    :`${lrCnt} hasta LR sınıfında (yaş 1–10y, WBC<50, favorable genomik, MRD<%0.01). Tedavi yoğunluğu azaltılması değerlendirilebilir.`});
  if(!findings.length) findings.push({level:"good",text:isEN
    ?"Population profile calculated. Review individual patients for detailed prognostic assessment."
    :"Popülasyon profili hesaplandı. Detaylı prognostik değerlendirme için bireysel hastaları inceleyin."});

  const lIcon={critical:"⚠",warn:"⚡",info:"ℹ",good:"✓"};
  const lCol={critical:"#ef4444",warn:"#f59e0b",info:"#38bdf8",good:"#10b981"};

  return (
    <div className={`rounded-2xl border p-5 space-y-4 ${d?"bg-slate-900 border-amber-900/30":"bg-white border-amber-200"}`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className={`text-sm font-semibold ${d?"text-slate-200":"text-slate-700"}`}>
          📋 {isEN?"GAN Population Summary":"GAN Popülasyon Özeti"}
          <span className={`ml-2 text-xs font-normal ${d?"text-slate-500":"text-slate-400"}`}>({patients.length})</span>
        </p>
        <button onClick={onExport}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border font-semibold ${d?"border-amber-500/30 text-amber-400 hover:bg-amber-500/10":"border-amber-300 text-amber-700 hover:bg-amber-50"}`}>
          ⬇ {isEN?"Export All":"Tümünü Dışa Aktar"}
        </button>
      </div>

      {/* Risk dağılımı — 5 sınıf (Köse et al. 2026 — Tablo 1) */}
      <div className="grid grid-cols-5 gap-1.5">
        {[
          {id:"lr", l:isEN?"Low (LR)":"Düşük (LR)",     c:"#10b981", efs:"~95–98%"},
          {id:"sr", l:isEN?"Standard (SR)":"Standart (SR)",c:"#34d399",efs:"~85–95%"},
          {id:"ir", l:isEN?"Intermediate (IR)":"Orta (IR)",c:"#f59e0b",efs:"~75–88%"},
          {id:"hr", l:isEN?"High (HR)":"Yüksek (HR)",    c:"#ef4444", efs:"~60–80%"},
          {id:"vhr",l:isEN?"VHR":"Çok Yüksek (VHR)",    c:"#7c3aed", efs:"~30–60%"},
        ].map(({id,l,c,efs})=>(          <div key={id} className={`rounded-xl p-2 text-center border ${d?"bg-slate-800 border-slate-700":"bg-slate-50 border-slate-200"}`}>
            <p className="text-base font-bold" style={{color:c}}>{cnt[id]||0}</p>
            <p className="text-xs font-mono opacity-60" style={{color:c}}>%{totalRisk?Math.round((cnt[id]||0)/totalRisk*100):0}</p>
            <p className={`text-xs mt-0.5 leading-tight ${d?"text-slate-500":"text-slate-400"}`}>{l}</p>
            <p className="text-xs opacity-40" style={{color:c}}>{efs}</p>
          </div>
        ))}
      </div>
      {/* Risk yorumlama notu */}
      <div className={`rounded-xl border p-3 text-xs ${d?"border-blue-500/20 bg-blue-500/5":"border-blue-200 bg-blue-50"}`}>
        <p className={`font-semibold mb-1 ${d?"text-blue-300":"text-blue-700"}`}>
          ℹ {isEN?"How to interpret risk classes (Köse et al. 2026 — Table 1)":"Risk sınıfları nasıl yorumlanır (Köse et al. 2026 — Tablo 1)"}
        </p>
        <p className={d?"text-slate-400":"text-slate-600"}>
          {isEN
            ?"Risk class is determined by integrating baseline clinical features (age, WBC at diagnosis), genomic markers (ETV6-RUNX1, BCR-ABL1, etc.), early treatment response (Day 8 steroid, Day 15 BM morphology) and MRD at end of induction (D29–33). MRD is the strongest dynamic prognostic factor — a favorable-genetics patient may shift upward if MRD ≥0.1%. The 5y EFS ranges are literature benchmarks, not individual predictions."
            :"Risk sınıfı; tanı anı klinik özellikler (yaş, WBC), genomik belirteçler (ETV6-RUNX1, BCR-ABL1 vb.), erken tedavi yanıtı (G8 steroid, G15 KİM) ve indüksiyon sonu MRD (G29–33) entegrasyonuyla belirlenir. MRD en güçlü dinamik prognostik faktördür — favorable genetikli bir hasta MRD ≥%0.1 ise üst sınıfa kayabilir. 5y EFS aralıkları bireysel tahmin değil, literatür referansıdır."}
        </p>
        <p className={`mt-1 italic ${d?"text-slate-600":"text-slate-400"}`}>
          Köse, U., Ceylan, O., &amp; Surucu, E. B. (2026). A Unified Prognostic Data Architecture for Risk Stratification in Pediatric ALL. <em>AICCONF 2026</em>, IEEE.
        </p>
      </div>

      {/* Ekstrinsik faktör ortalamaları */}
      <div>
        <p className={`text-xs font-semibold mb-2 ${d?"text-slate-400":"text-slate-600"}`}>
          {isEN?"Prognostic Factor Averages (Köse et al. 2026)":"Prognostik Faktör Ortalamaları (Köse et al. 2026)"}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {/* Açıklama: continuous=popülasyon ortalaması, binary=var olan hasta yüzdesi, categorical=mod kategori */}
          {(schema||[]).map(ef=>{
            const avg=extAvgs[ef.id];
            // Renk: binary/categorical için risk yönünde (yüksek değer = daha riskli)
            // SES için ters (yüksek SES = düşük risk)
            const riskVal=ef.id==="ses_index"?1-(avg||0):(avg||0);
            const col=riskVal>0.6?"#ef4444":riskVal>0.35?"#f59e0b":"#10b981";
            const label=isEN?ef.label_en:ef.label_tr;
            let disp;
            if(ef.kind==="binary"){
              disp=`${(avg*100).toFixed(0)}% ${isEN?"of patients have this":"hastada mevcut"}`;
            } else if(ef.kind==="categorical"&&ef.options){
              // Ortalama değere en yakın seçenek etiketi
              const oi=ef.options.reduce((best,opt,i)=>
                Math.abs(opt-(avg||0))<Math.abs(ef.options[best]-(avg||0))?i:best, 0);
              const labels=isEN?ef.option_labels_en:ef.option_labels_tr;
              const optLbl=labels?.[oi]?.split("(")[0]?.trim()||"";
              disp=`${(avg||0).toFixed(2)} (${optLbl})`;
            } else {
              // continuous: normalize 0-1 → yüzde
              disp=`${((avg||0)*100).toFixed(0)}%`;
            }
            return (
              <div key={ef.id}
                className={`rounded-xl p-2.5 border ${d?"bg-slate-800 border-slate-700":"bg-amber-50/50 border-amber-100"}`}
                title={ef.ref||label}>
                <div className="flex items-center justify-between gap-1">
                  <p className={`text-xs truncate ${d?"text-slate-400":"text-amber-700"}`}>{label}</p>
                  <p className="text-xs font-bold font-mono flex-shrink-0" style={{color:col}}>{disp}</p>
                </div>
                <div className={`w-full rounded-full h-1 mt-1 ${d?"bg-slate-700":"bg-amber-100"}`}>
                  <div className="h-1 rounded-full" style={{width:`${riskVal*100}%`,background:col}}/>
                </div>
                <p className={`text-xs mt-1 opacity-50 ${d?"text-slate-500":"text-slate-400"}`}>
                  {ef.kind==="binary"?(isEN?"% with factor":"% faktör olan")
                   :ef.kind==="categorical"?(isEN?"population mode":"popülasyon modu")
                   :(isEN?"population avg":"popülasyon ort.")}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* İlaç doz özeti */}
      {(()=>{
        const doseKey=(key)=>key==="daunorubicin"?"dose_dnr_mg_m2":key==="asparaginase"?"peg_dose_per_m2":`dose_${key}_mg`;
        const withDrug=(drug)=>patients.filter(p=>(p.clinical?.[doseKey(drug)]||0)>0);
        const avgDose=(drug)=>{
          const arr=withDrug(drug).map(p=>p.clinical?.[doseKey(drug)]||0).filter(Boolean);
          return arr.length?arr.reduce((s,v)=>s+v,0)/arr.length:null;
        };
        const drugDefs=Object.entries(DRUG_PALETTE)
          .filter(([k,v])=>v.ode||v.peg)
          .map(([k,v])=>({
            key:k, lbl:v.label, col:v.color,
            desc:v.peg?(isEN?"separate PK sim":"ayrı PK simülatörü")
              :(k==="6mp"?(isEN?"daily oral":"günlük oral")
              :k==="mtx"?(isEN?"weekly":"haftalık")
              :k==="vcr"?(isEN?"28-day IV":"28 günlük IV")
              :k==="daunorubicin"?(isEN?"IV bolus":"IV bolus")
              :v.labelFull),
          }));
        const activeDrugs=drugDefs.filter(d2=>avgDose(d2.key)!=null);
        if(!activeDrugs.length) return null;
        const t_end=patients[0]?.clinical?.t_end||120;
        return (
          <div className={`rounded-xl border p-3 ${d?"border-slate-700 bg-slate-800/40":"border-indigo-100 bg-indigo-50/30"}`}>
            <p className={`text-xs font-bold mb-2 ${d?"text-slate-400":"text-slate-600"}`}>
              💊 {isEN?"Treatment Protocol Summary":"Tedavi Protokolü Özeti"} · {isEN?"Duration":"Süre"}: {t_end} {isEN?"days":"gün"}
            </p>
            <div className="flex gap-2 flex-wrap">
              {activeDrugs.map(({key,lbl,col,desc})=>{
                const avg=avgDose(key);
                const doses=patients.map(p=>p.clinical?.[doseKey(key)]||0).filter(Boolean);
                const mn=Math.min(...doses), mx=Math.max(...doses);
                return (
                  <div key={key} className="rounded-xl px-3 py-2 border flex items-center gap-2"
                       style={{background:`${col}15`,borderColor:`${col}44`}}>
                    <div className="w-2.5 h-2.5 rounded-full" style={{background:col}}/>
                    <div>
                      <p className="text-xs font-bold" style={{color:col}}>{lbl}</p>
                      <p className={`text-xs ${d?"text-slate-500":"text-slate-400"}`}>
                        {isEN?"avg":"ort"} {avg?.toFixed(1)}mg ({mn?.toFixed(0)}–{mx?.toFixed(0)})
                      </p>
                      <p className={`text-xs ${d?"text-slate-600":"text-slate-400"}`}>{desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Bulgular */}
      <div>
        <p className={`text-xs font-semibold mb-2 ${d?"text-slate-400":"text-slate-600"}`}>
          {isEN?"Clinical & Contextual Findings":"Klinik ve Bağlamsal Bulgular"}
        </p>
        <div className="space-y-2">
          {findings.map((f,i)=>(
            <div key={i} className="flex gap-2 items-start text-xs">
              <span className="flex-shrink-0 font-bold" style={{color:lCol[f.level]}}>{lIcon[f.level]}</span>
              <span className={d?"text-slate-300":"text-slate-700"}>{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Tab6GAN({ dark, onGoTo }) {
  const { lang }=useLang(); const isEN=lang==="en"; const d=dark;

  const [schema,       setSchema]       = useState([]);
  const [extrinsic,    setExtrinsic]    = useState({});
  const [gnnPool,      setGnnPool]      = useState(null);
  const [ganMode,      setGanMode]      = useState("pretrained"); // "pretrained" | "train"
  const [trainPhase,   setTrainPhase]   = useState("idle");
  const [trainEpoch,   setTrainEpoch]   = useState(0);
  const [trainEpochs,  setTrainEpochs]  = useState(500);
  const [gLosses,      setGLosses]      = useState([]);
  const [dLosses,      setDLosses]      = useState([]);
  const [gLoss,        setGLoss]        = useState(null);
  const [dLoss,        setDLoss]        = useState(null);
  const [trainResult,  setTrainResult]  = useState(null);
  const [trainError,   setTrainError]   = useState(null);
  const [ganJobId,     setGanJobId]     = useState(null);
  const [genStatus,    setGenStatus]    = useState("idle");
  const [nPatients,    setNPatients]    = useState(20);
  const [seed,         setSeed]         = useState(42);
  const [genError,     setGenError]     = useState(null);
  const [cohortData,   setCohortData]   = useState(null);
  const [selectedIdx,  setSelectedIdx]  = useState(null);
  const [genProgress,  setGenProgress]  = useState(0);
  const abortRef=useRef(null);

  const card=`rounded-2xl border ${d?"bg-slate-900 border-amber-900/30":"bg-white border-amber-200"}`;

  // Schema yükle
  useEffect(()=>{
    apiGet("/gan/schema").then(s=>{
      setSchema(s.extrinsic_schema||[]);
      setGnnPool(s.gnn_pool||null);
      const defs={};
      (s.extrinsic_schema||[]).forEach(ef=>{defs[ef.id]=ef.default;});
      setExtrinsic(defs);
    }).catch(()=>{});
  },[]);

  const handleExtrinsicChange=(id,val)=>setExtrinsic(prev=>({...prev,[id]:val}));

  // GAN eğitimi
  const handleTrain=async()=>{
    if(trainPhase==="training"){
      if(abortRef.current)abortRef.current.abort();
      setTrainPhase("idle"); setGLosses([]); setDLosses([]); return;
    }
    abortRef.current=new AbortController();
    setTrainPhase("training"); setTrainEpoch(0); setGLosses([]); setDLosses([]);
    setGLoss(null); setDLoss(null); setTrainError(null); setTrainResult(null);

    try{
      const res=await fetch(`${BASE}/gan/train-stream`,{
        method:"POST",
        headers:{Authorization:`Bearer ${tok()}`,"Content-Type":"application/json"},
        body:JSON.stringify({epochs:trainEpochs, latent_dim:100, lr:0.0002, dropout:0.3,
                             batch_size:32, extrinsic}),
        signal:abortRef.current.signal,
      });
      if(!res.ok){const e=await res.json().catch(()=>({detail:"Hata"}));throw new Error(e.detail||"Hata");}
      const reader=res.body.getReader(); const decoder=new TextDecoder(); let buf="";
      while(true){
        const {done,value}=await reader.read(); if(done)break;
        buf+=decoder.decode(value,{stream:true});
        const lines=buf.split("\n"); buf=lines.pop()||"";
        for(const line of lines){
          if(!line.startsWith("data:"))continue;
          try{
            const msg=JSON.parse(line.slice(5).trim());
            if(msg.type==="epoch"){
              setTrainEpoch(msg.epoch);
              if(msg.g_loss!=null){setGLoss(msg.g_loss);setGLosses(h=>[...h,msg.g_loss]);}
              if(msg.d_loss!=null){setDLoss(msg.d_loss);setDLosses(h=>[...h,msg.d_loss]);}
            } else if(msg.type==="done"){
              setTrainEpoch(msg.epochs||trainEpochs);
              setTrainPhase("done"); setTrainResult(msg); setGanJobId(msg.job_id);
              setGLosses(msg.g_losses||[]); setDLosses(msg.d_losses||[]);
              setGLoss(msg.final_g_loss); setDLoss(null);
            } else if(msg.type==="error"){
              setTrainError(msg.message); setTrainPhase("error");
            }
          }catch{}
        }
      }
    }catch(e){
      if(e.name==="AbortError"){setTrainPhase("idle");return;}
      setTrainError(e.message); setTrainPhase("error");
    }
  };

  // Hasta üretimi
  const handleGenerate=async()=>{
    if(!ganJobId){setGenError(isEN?"Train GAN first.":"Önce GAN'ı eğitin.");return;}
    setGenStatus("running"); setGenError(null); setCohortData(null); setGenProgress(0);
    const t0=Date.now();
    const timer=setInterval(()=>setGenProgress(p=>Math.min(p+5,90)),300);
    try{
      const r=await apiPost("/gan/generate",{gan_job_id:ganJobId,n_patients:nPatients,seed,extrinsic});
      clearInterval(timer); setGenProgress(100);
      const full=await apiGet(`/gan/cohort/${r.job_id}`);
      setCohortData(full); setGenStatus("done");
    }catch(e){clearInterval(timer);setGenError(e.message);setGenStatus("error");}
  };

  const pts=cohortData?.patients||[];

  const exportCSV=()=>{
    if(!pts.length)return;
    const schemaIds=(schema||[]).map(ef=>ef.id);
    const rows=pts.map(p=>({
      patient_id:    p.patient_id,
      risk_class:    p.risk_class,
      extrinsic_risk:`${((p.extrinsic_risk_score||0)*100).toFixed(1)}%`,
      age:           p.clinical?.age??"",
      weight_kg:     p.clinical?.weight_kg??"",
      tpmt:          p.clinical?.tpmt??"",
      vitamin_d:     p.clinical?.vitamin_d??"",
      diet:          p.clinical?.diet??"",
      exercise:      p.clinical?.exercise??"",
      wbc_min:       p.summary?.wbc_min??"",
      anc_min:       p.summary?.anc_min??"",
      wbc_in_target: p.summary?.wbc_in_target_pct??"",
      ...Object.fromEntries(schemaIds.map(id=>[id, p.extrinsic?.[id]??""])),
    }));
    const h=Object.keys(rows[0]);
    const csv=[h.join(","),...rows.map(r=>h.map(k=>r[k]).join(","))].join("\n");
    const b=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const u=URL.createObjectURL(b); const a=document.createElement("a");
    a.href=u; a.download=`sting_gan_patients_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
  };

  const howToSteps=isEN?[
    {title:"GNN → GAN Flow",desc:"Tab 5 (GNN) generates clinical-only digital twins. Tab 6 (GAN) takes those GNN patient summaries, adds contextual factors (environment, stress, socioeconomic), and generates an enriched patient population with risk classification."},
    {title:"Set Prognostic Factors",desc:"Enter literature-supported prognostic parameters: immunophenotype, CNS status, genomic risk category, Day 8 steroid response, MRD at end of induction, and socioeconomic context. Each parameter is grounded in Table 1 (Köse et al. 2026) and COG/BFM risk criteria."},
    {title:"Train GAN",desc:"The GAN learns the distribution of GNN patient summaries plus your extrinsic factors. Training is live-streamed epoch by epoch. Both Generator and Discriminator losses are shown."},
    {title:"Generate & Evaluate",desc:"Generate synthetic patients. Each receives a 5-class unified risk score (LR/SR/IR/HR/VHR — Köse et al. 2026, Table 1). Prognostic risk score weighted by: MRD 30%, genomic risk 25%, Day 8 steroid 15%. Compare with Tab 5 GNN: GNN=PK/PD clinical only, GAN=PK/PD + unified prognostic risk architecture."},
  ]:[
    {title:"GNN → GAN Akışı",desc:"Tab 5 (GNN) yalnızca klinik dijital ikizler üretir. Tab 6 (GAN) bu GNN hasta özetlerini alır, çevresel ve yaşamsal faktörler (çevre, stres, sosyoekonomik) ekler ve risk sınıflandırması ile zenginleştirilmiş popülasyon üretir."},
    {title:"Prognostik Faktörleri Ayarla",desc:"İmmünofenotip, CNS durumu, genomik risk, gün 8 steroid yanıtı, MRD indüksiyon sonu gibi literatür destekli prognostik parametreleri girin. Her parametre Tablo 1 (Köse et al. 2026) ve COG/BFM kriterlerine dayanmaktadır."},
    {title:"GAN'ı Eğit",desc:"GAN, GNN hasta özetleri ve çevresel/yaşamsal faktörlerin dağılımını öğrenir. Eğitim epoch-by-epoch canlı yayınlanır. Generator ve Discriminator kayıpları gösterilir."},
    {title:"Üret ve Değerlendir",desc:"Sentetik hastalar üretin. Her hasta 5 sınıflı birleşik risk skoru alır (LR/SR/IR/HR/VHR — Köse et al. 2026 Tablo 1). Prognostik risk skoru; MRD ağırlığı %30, genomik risk %25, gün 8 steroid %15 ile hesaplanır. Tab 5 GNN hastaları ile karşılaştırın: GNN=PK/PD klinik, GAN=PK/PD+prognostik risk mimarisi."},
  ];

  return (
    <div className="space-y-5">
      <HowToUse steps={howToSteps} dark={d}/>

      {/* Ekstrinsik faktörler */}
      {/* GNN Kaynak Veri Paneli */}
      {/* Mod seçimi */}
      <div className={`rounded-2xl border p-5 ${d?"bg-slate-900 border-amber-900/30":"bg-white border-amber-200 shadow-sm"}`}>
        <p className={`text-sm font-semibold mb-3 ${d?"text-slate-200":"text-slate-700"}`}>
          🧬 GAN v2 — {isEN?"Select Mode":"Mod Seçin"}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["pretrained",
             isEN?"Use Pre-trained Model":"Hazır Modeli Kullan",
             isEN?"Generate synthetic patients from the pre-built GAN model (1000 patient cohort, 5 risk classes)."
                 :"Hazır GAN modelinden sentetik hasta üretin (1000 hastalık kohort, 5 risk sınıfı).",
             "✓"],
            ["train",
             isEN?"Train New Model":"Yeni Model Eğit",
             isEN?"Build training data from GA pool, train a new CTGAN model, save and upload it."
                 :"GA havuzundan eğitim verisi oluşturun, yeni CTGAN modeli eğitin, kaydedin ve yükleyin.",
             "⚙"],
          ].map(([v,title,desc,icon])=>(
            <button key={v} onClick={()=>setGanMode(v)}
              className={`text-left rounded-2xl border p-4 transition-all ${
                ganMode===v
                  ?(d?"bg-amber-600/20 border-amber-500":"bg-amber-50 border-amber-400")
                  :(d?"bg-slate-800 border-slate-700 hover:border-slate-600":"bg-white border-slate-200 hover:border-amber-200")}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base">{icon}</span>
                <span className={`text-sm font-semibold ${
                  ganMode===v?(d?"text-amber-300":"text-amber-700"):(d?"text-slate-300":"text-slate-700")}`}>
                  {title}
                </span>
              </div>
              <p className={`text-xs leading-relaxed ${d?"text-slate-500":"text-slate-400"}`}>{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Hazır model modu */}
      {ganMode==="pretrained"&&(
        <GANv2Panel dark={d} isEN={isEN} onCohortReady={(pts, jobId)=>{
          setCohortData({patients: pts, job_id: jobId});
        }}/>
      )}

      {/* Yeni eğitim modu */}
      {ganMode==="train"&&(
        <GANTrainingPanel dark={d} isEN={isEN} onModelTrained={()=>{}}/>
      )}


      {/* GAN v2 Faktör Açıklaması — açılır/kapanır */}
      <GANFactorPanel dark={d} isEN={isEN}/>





      {/* Sonuçlar — sadece hazır model modunda */}
      {ganMode==="pretrained"&&pts.length>0&&<>
        <GANCohortGrid patients={pts} dark={d} isEN={isEN} schema={schema}
          onSelect={(p)=>setSelectedIdx(pts.indexOf(p))}/>
        <GANSummary patients={pts} dark={d} isEN={isEN} schema={schema} onExport={exportCSV}/>
        <GANXAIPanel dark={d} isEN={isEN} patients={pts}/>
        <RepoScenarioPanel dark={d} isEN={isEN} jobId={cohortData?.job_id}/>
      </>}



      {/* Modal */}
      {selectedIdx!==null&&pts[selectedIdx]&&(
        <GANPatientModal
          patient={pts[selectedIdx]} schema={schema} dark={d} isEN={isEN}
          onClose={()=>setSelectedIdx(null)}
          onPrev={()=>setSelectedIdx(i=>Math.max(0,i-1))}
          onNext={()=>setSelectedIdx(i=>Math.min(pts.length-1,i+1))}
          currentIdx={selectedIdx} totalCount={pts.length}
        />
      )}
    </div>
  );
}
