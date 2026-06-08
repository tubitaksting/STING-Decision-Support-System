// src/App.jsx
import React, { useState, useEffect, useRef, createContext, useContext } from "react";
import { login as apiLogin, getMe } from "./services/api";
import Tab1Repurposing from "./components/tabs/Tab1Repurposing";
import Tab2Parameters  from "./components/tabs/Tab2Parameters";
import Tab3ODE         from "./components/tabs/Tab3ODE";
import Tab4GA          from "./components/tabs/Tab4GA";
import Tab5GNN         from "./components/tabs/Tab5GNN";
import Tab6GAN         from "./components/tabs/Tab6GAN";
import TabAdmin        from "./components/tabs/TabAdmin";
import SurveyModal      from "./components/ui/SurveyModal";
import AboutModal       from "./components/ui/AboutModal";
import { LangProvider, useLang } from "./i18n/LangContext";
import LangSwitcher from "./components/ui/LangSwitcher";
import ProjectToolbar from "./components/ui/ProjectToolbar";
import { useProject } from "./hooks/useProject";
import { STING_LOGO } from "./assets/logo";

// ── Theme context ──────────────────────────────────────────────────────────
const ThemeCtx = createContext({ dark: false, toggle: () => {} });
export const useTheme = () => useContext(ThemeCtx);

// ── SVG icon set ───────────────────────────────────────────────────────────
const Icons = {
  pill:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 20H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v7"/><path d="M8 14v-4"/><path d="M12 14v-4"/><path d="M16 10v2"/><circle cx="18" cy="18" r="4"/><path d="M15.5 18h5"/></svg>,
  sliders: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>,
  chart:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  network: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4M8.5 16.5L12 11M15.5 16.5L12 11"/></svg>,
  dna:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="M2 9c6.667-6 13.333 0 20-6"/></svg>,
  sun:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  moon:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  logout:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  user:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  check:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  wrench:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
  lock:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
  eye:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  menu:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
};

function Icon({ name, size = 18, className = "" }) {
  const svg = Icons[name];
  if (!svg) return null;
  // SVG'ye doğrudan width/height ver — iOS Chrome dahil tüm tarayıcılarda güvenli
  const sized = React.cloneElement(svg, {
    width: size,
    height: size,
    style: { display: "block", flexShrink: 0 },
  });
  return (
    <span className={`inline-flex items-center justify-center flex-shrink-0 ${className}`}>
      {sized}
    </span>
  );
}

// ── Tab definitions — labels resolved via t() at render time ──────────────
const TABS = [
  { id: "tab1",  labelKey: "tab1Label",  shortKey: "tab1Short",  icon: "pill",    component: "Tab1" },
  { id: "tab2",  labelKey: "tab2Label",  shortKey: "tab2Short",  icon: "sliders", component: "Tab2" },
  { id: "tab3",  labelKey: "tab3Label",  shortKey: "tab3Short",  icon: "chart",   component: "Tab3" },
  { id: "tab4",  labelKey: "tab4Label",  shortKey: "tab4Short",  icon: "dna",     component: "Tab4" },
  { id: "tab5",  labelKey: "tab5Label",  shortKey: "tab5Short",  icon: "network", component: "ComingSoon" },
  { id: "tab6",  labelKey: "tab6Label",  shortKey: "tab6Short",  icon: "dna",     component: "ComingSoon" },
  { id: "admin", labelKey: "adminLabel", shortKey: "adminShort", icon: "wrench",  component: "Admin" },
];

const COMING_SOON_INFO = {
  tab2: { title: "Parametre & Başlangıç Kurulumu",   desc: "İlaç seçimi, hasta başlangıç parametreleri (yaş, ağırlık, lösemi yükü) ve ODE zaman ufku ayarları bu ekranda yapılandırılacak.",          accentDark: "#3b82f6", accentLight: "#2563eb" },
  tab3: { title: "ODE Simülasyon Motoru",            desc: "PK/PD farmakokinetik modeller, tümör dinamiği ODE'leri ve doz optimizasyon çıktıları burada görselleştirilecek.",                          accentDark: "#a855f7", accentLight: "#7c3aed" },
  tab4: { title: "GNN Tedavi Akış Grafiği",          desc: "ODE çıktılarını eğitim verisi olarak kullanan GNN modeli hasta tedavi yollarını ve olası sonuçları tahmin edecek.",                        accentDark: "#14b8a6", accentLight: "#0d9488" },
  tab5: { title: "GAN + XAI Sentetik Hasta Raporu",  desc: "GAN ile üretilen N sentetik hasta profili, nüksetme risk skorları ve SHAP/LIME açıklamaları bu ekranda raporlanacak.",                     accentDark: "#f97316", accentLight: "#ea580c" },
};

// ── Coming soon placeholder ────────────────────────────────────────────────
const ACCENT_MAP = { tab2: "#3b82f6", tab3: "#a855f7", tab4: "#14b8a6", tab5: "#f97316" };
// ── GA tamamlanmadan GNN/GAN erişim engeli ────────────────────────────────
function GnnGanBlocked({ id, dark, onUnlock }) {
  const { t, lang } = useLang();
  const isEN = lang === "en";
  const d = dark;
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-8">
      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 ${d?"bg-amber-500/10 border border-amber-500/30":"bg-amber-50 border border-amber-200"}`}>
        <svg className={`w-10 h-10 ${d?"text-amber-400":"text-amber-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
        </svg>
      </div>
      <h3 className={`text-lg font-semibold mb-3 ${d?"text-gray-100":"text-gray-800"}`}>
        {isEN?"Dose Optimization Required":"Doz Optimizasyonu Gerekli"}
      </h3>
      <p className={`text-sm max-w-md leading-relaxed mb-4 ${d?"text-gray-400":"text-gray-500"}`}>
        {isEN
          ?`${id.toUpperCase()} requires GA Dose Optimization (Tab 4) to be completed first. GNN/GAN models need optimized dose data as training input.`
          :`${id.toUpperCase()} için önce GA Doz Optimizasyonu (Tab 4) tamamlanmalıdır. GNN/GAN modelleri eğitim girdisi olarak optimize edilmiş doz verisi gerektirir.`}
      </p>

      <div className={`px-5 py-2.5 rounded-full text-xs font-medium border mb-8 ${d?"border-amber-500/30 text-amber-400":"border-amber-300 text-amber-600"}`}>
        {isEN?"→ Complete Tab 4 first (recommended)":"→ Önce Tab 4'ü tamamlayın (önerilen)"}
      </div>

      {/* Bypass seçeneği */}
      <div className={`rounded-2xl border p-5 max-w-md w-full ${d?"border-gray-700 bg-gray-800/50":"border-gray-200 bg-gray-50"}`}>
        <div className="flex items-center gap-2 mb-2">
          <svg className={`w-4 h-4 ${d?"text-blue-400":"text-blue-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
          </svg>
          <p className={`text-sm font-semibold ${d?"text-gray-200":"text-gray-700"}`}>
            {isEN?"Use Existing Dataset":"Hazır Veri Seti Kullan"}
          </p>
        </div>
        <p className={`text-xs leading-relaxed mb-4 ${d?"text-gray-400":"text-gray-500"}`}>
          {isEN
            ?"If you already have compatible training data (from a previous session or external source), you can unlock this section and upload your data directly."
            :"Daha önce üretilmiş veya dış kaynaktan uyumlu eğitim veriniz varsa bu bölümü açıp verinizi doğrudan yükleyebilirsiniz."}
        </p>

        {!showConfirm ? (
          <button onClick={()=>setShowConfirm(true)}
            className={`w-full py-2 rounded-xl text-sm font-semibold border transition-colors ${
              d?"border-blue-500/40 text-blue-400 hover:bg-blue-500/10":"border-blue-300 text-blue-700 hover:bg-blue-50"}`}>
            {isEN?"🔓 Unlock with existing data":"🔓 Hazır veriyle aç"}
          </button>
        ) : (
          <div className={`rounded-xl border p-4 ${d?"border-amber-500/30 bg-amber-500/10":"border-amber-200 bg-amber-50"}`}>
            <p className={`text-xs font-semibold mb-3 ${d?"text-amber-300":"text-amber-700"}`}>
              ⚠ {isEN?"Are you sure?":"Emin misiniz?"}
            </p>
            <p className={`text-xs mb-4 ${d?"text-amber-400/80":"text-amber-600"}`}>
              {isEN
                ?"Using unoptimized or incompatible data may produce unreliable GNN results. Make sure your data includes WBC/ANC timeseries with proper dose information."
                :"Optimize edilmemiş veya uyumsuz veri GNN sonuçlarını olumsuz etkileyebilir. Verinizde WBC/ANC zaman serileri ve doz bilgilerinin bulunduğundan emin olun."}
            </p>
            <div className="flex gap-2">
              <button onClick={onUnlock}
                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white">
                {isEN?"Yes, unlock":"Evet, aç"}
              </button>
              <button onClick={()=>setShowConfirm(false)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold ${d?"bg-gray-700 text-gray-300":"bg-gray-200 text-gray-700"}`}>
                {isEN?"Cancel":"İptal"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ComingSoon({ id, gaResult }) {
  const { dark } = useTheme();
  const { t } = useLang();
  const d = dark;
  const accent = ACCENT_MAP[id] || "#3b82f6";
  const tab = TABS.find(tb => tb.id === id);

  return (
    <div className="space-y-5">
      {/* Tab5: GA sonuçlarını göster */}
      {id === "tab5" && gaResult?.best_plan && (
        <div className={`rounded-2xl border p-5 ${d?"bg-gray-900 border-gray-800":"bg-white border-gray-200"}`}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/>
            <p className={`text-sm font-semibold ${d?"text-gray-200":"text-gray-800"}`}>
              GA Doz Optimizasyonu Sonuçları — GNN Girdi Verisi
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              {label:"WBC Hedefte", value:`${((gaResult.best_metrics?.wbc_target_frac||0)*100).toFixed(1)}%`, color:"#3b82f6"},
              {label:"ANC Hedefte", value:`${((gaResult.best_metrics?.anc_target_frac||0)*100).toFixed(1)}%`, color:"#10b981"},
              {label:"WBC min",     value:(gaResult.best_metrics?.wbc_min||0).toFixed(3),                     color:"#8b5cf6"},
            ].map((m,i)=>(
              <div key={i} className="rounded-xl p-3 text-center border"
                   style={{borderColor:`${m.color}44`,background:`${m.color}0d`}}>
                <p className="text-lg font-bold font-mono" style={{color:m.color}}>{m.value}</p>
                <p className="text-xs mt-1 opacity-70" style={{color:m.color}}>{m.label}</p>
              </div>
            ))}
          </div>
          <p className={`text-xs font-semibold mb-2 ${d?"text-gray-400":"text-gray-600"}`}>Optimal Doz Planı</p>
          <div className="flex gap-2 flex-wrap">
            {gaResult.best_plan?.["6mp"]?.slice(0,6).map((v,i)=>(
              <span key={i} className="text-xs px-2 py-1 rounded-lg font-mono"
                    style={{background:"#3b82f620",color:"#3b82f6",border:"1px solid #3b82f644"}}>
                H{i+1}: {v.toFixed(1)}mg 6-MP
              </span>
            ))}
            {gaResult.best_plan?.vcr?.map((v,i)=>(
              <span key={`v${i}`} className="text-xs px-2 py-1 rounded-lg font-mono"
                    style={{background:"#8b5cf620",color:"#8b5cf6",border:"1px solid #8b5cf644"}}>
                D{i+1}: {v.toFixed(2)}mg VCR
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Coming soon panel */}
      <div className="flex flex-col items-center justify-center py-20 text-center px-8">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
             style={{ background: `${accent}18`, border: `1px solid ${accent}40` }}>
          <Icon name={tab?.icon || "wrench"} size={32} />
        </div>
        <h3 className={`text-lg font-semibold mb-3 ${d ? "text-gray-100" : "text-gray-800"}`}>{t(`${id}ComingSoonTitle`)}</h3>
        <p className={`text-sm max-w-md leading-relaxed ${d ? "text-gray-400" : "text-gray-500"}`}>{t(`${id}ComingSoonDesc`)}</p>
        <div className={`mt-8 px-5 py-2.5 rounded-full text-xs font-medium border ${d ? "border-gray-700 text-gray-500" : "border-gray-200 text-gray-400"}`}>
          {t("underDevelopment")}
        </div>
      </div>
    </div>
  );
}

// ── Login ──────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, dark, toggleDark }) {
  const { t, lang } = useLang();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const data = await apiLogin(username, password);
      localStorage.setItem("sting_token", data.access_token);
      onLogin(data.user);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const d = dark;
  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${d ? "bg-gray-950" : "bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100"}`}>
      <div className={`w-full max-w-md p-8 space-y-6 rounded-2xl shadow-2xl ${d ? "bg-gray-900 border border-gray-800" : "bg-white border border-gray-100"}`}>

        {/* Dark toggle + Lang switcher */}
        <div className="flex justify-between items-center">
          <LangSwitcher dark={d} />
          <button onClick={toggleDark}
            className={`p-2 rounded-lg transition-colors ${d ? "bg-gray-800 text-yellow-400 hover:bg-gray-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
            <Icon name={d ? "sun" : "moon"} size={16} />
          </button>
        </div>

        {/* Logo */}
        <div className="text-center -mt-2">
          <img src={STING_LOGO} alt="STING"
               className="h-20 object-contain mx-auto mb-3" />
          <p className={`text-sm leading-snug max-w-xs mx-auto ${d ? "text-gray-300" : "text-gray-700"}`}>
            {lang === "tr"
              ? "Çocukluk Çağı Akut Lösemisi İlaç Yeniden Konumlandırma ve Sentetik Hasta Tedavi Uygulama Karar Destek Sistemi"
              : "Drug Repositioning and Synthetic Patient Treatment Decision Support System for Childhood Acute Leukemia"}
          </p>
          <p className={`text-xs font-semibold mt-2 ${d ? "text-gray-500" : "text-gray-800"}`}>
            {lang === "tr"
              ? "Dijital İkiz Tabanlı Derin Öğrenme"
              : "Digital Twin-Oriented Deep Learning"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`text-xs font-medium block mb-1 ${d ? "text-gray-400" : "text-gray-600"}`}>{t("username")}</label>
            <div className="relative">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 ${d ? "text-gray-500" : "text-gray-400"}`}>
                <Icon name="user" size={15} />
              </span>
              <input type="text" required value={username} onChange={e => setUsername(e.target.value)}
                placeholder={t("usernamePlaceholder")}
                className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2 ${d
                  ? "bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-500 focus:ring-blue-500"
                  : "bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-400"}`} />
            </div>
          </div>

          <div>
            <label className={`text-xs font-medium block mb-1 ${d ? "text-gray-400" : "text-gray-600"}`}>{t("password")}</label>
            <div className="relative">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 ${d ? "text-gray-500" : "text-gray-400"}`}>
                <Icon name="lock" size={15} />
              </span>
              <input type={showPw ? "text" : "password"} required value={password}
                onChange={e => setPassword(e.target.value)} placeholder={t("passwordPlaceholder")}
                className={`w-full pl-9 pr-10 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2 ${d
                  ? "bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-500 focus:ring-blue-500"
                  : "bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-400"}`} />
              <button type="button" onClick={() => setShowPw(p => !p)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 ${d ? "text-gray-500 hover:text-gray-300" : "text-gray-400 hover:text-gray-600"}`}>
                <Icon name={showPw ? "eyeOff" : "eye"} size={15} />
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-2.5 text-sm">{error}</div>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-all text-sm shadow-lg shadow-blue-500/20">
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  {t("loggingIn")}
                </span>
              : t("login")}
          </button>
        </form>

        <div className={`flex items-center justify-center gap-2 text-xs ${d ? "text-gray-600" : "text-gray-400"}`}>
          {t("fundingLine")}
        </div>
      </div>
    </div>
  );
}

// ── DSS Shell ──────────────────────────────────────────────────────────────
function DSSShell({ user, onLogout, dark, toggleDark }) {
  const { t, lang } = useLang();
  const isEN = lang === "en";
  const [activeTab, setActiveTab] = useState("tab1");
  const tabScrollRefs = useRef({});

  // Tab değişince o tab'ın scroll pozisyonunu sıfırla
  useEffect(() => {
    const el = tabScrollRefs.current[activeTab];
    if (el) el.scrollTop = 0;
  }, [activeTab]);
  const project = useProject();
  const d = dark;
  const [showSurvey, setShowSurvey] = useState(false);
  const [showAbout,  setShowAbout]  = useState(false);

  // Log gönderme yardımcısı
  const postLog = async (tab, action, summary, detail="", duration_sec=0) => {
    try {
      const token = localStorage.getItem("sting_token");
      if (!token) return;
      await fetch(`/api/v1/admin/logs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tab, action, summary, detail, status:"success", duration_sec }),
      });
      window.dispatchEvent(new CustomEvent("sting:log"));
    } catch { /* log hatası kritik değil */ }
  };

  const handleTab1Complete = (sessionId, data) => {
    project.setTab1Result({ session_id: sessionId, ...data });
    postLog("tab1", "run_prediction", `Session: ${sessionId} · ${data.stats?.top_n||"?"} aday`);
  };
  const [tab2Proceeded,  setTab2Proceeded]  = useState(false);
  const [tab5Unlocked,   setTab5Unlocked]   = useState(false);
  const [sidebarOpen,    setSidebarOpen]    = useState(false);

  const handleTab2ConfigUpdate = (config) => {
    project.setTab2Config(config);
  };

  const handleTab2Proceed = (config) => {
    project.setTab2Config(config);
    setTab2Proceeded(true);
    setActiveTab("tab3");
    postLog("tab2", "configure_params",
      `Faz: ${config.phase_key} · İlaçlar: ${config.active_drugs?.join(",")} · ${config.t_end}gün`);
  };
  const handleTab3Complete = (result) => {
    project.setTab3Result(result);
    const s = result?.summary || {};
    postLog("tab3", "run_ode",
      `WBC min: ${s.wbc_min} · ANC min: ${s.anc_min} · Hedefte: ${s.wbc_in_target_pct}%`,
      `sim_id: ${result?.sim_id||""}`);
  };
  const handleTab4Complete = (result) => {
    project.setTab4Result(result);
    const m = result?.best_metrics || {};
    postLog("tab4", "run_ga",
      `WBC hedefte: ${((m.wbc_target_frac||0)*100).toFixed(1)}% · ANC: ${((m.anc_target_frac||0)*100).toFixed(1)}% · Skor: ${(result?.best_score||0).toFixed(2)}`,
      `job_id: ${result?.job_id||""}`);
  };

  // Tab içerikleri her zaman mount'lu, sadece gizlenir → state kaybolmaz
  const tabContent = [
    { id: "tab1", el: <Tab1Repurposing onComplete={handleTab1Complete} session={project.tab1Result} dark={d} onGoTo={setActiveTab} /> },
    { id: "tab2", el: <Tab2Parameters dark={d} onConfigUpdate={handleTab2ConfigUpdate} onProceed={handleTab2Proceed} initialConfig={project.tab2Config} onGoTo={setActiveTab} /> },
    { id: "tab3", el: <Tab3ODE dark={d} config={project.tab2Config} onComplete={handleTab3Complete} onRerun={project.resetFromTab3} onGoTo={setActiveTab} /> },
    { id: "tab4", el: <Tab4GA dark={d} config={project.tab2Config} odeResult={project.tab3Result} onComplete={handleTab4Complete} onGoTo={setActiveTab} /> },
    { id: "tab5", el: (tab2Proceeded || tab5Unlocked)
        ? <Tab5GNN dark={d} gaResult={project.tab4Result} config={project.tab2Config} onGoTo={setActiveTab} />
        : <GnnGanBlocked id="tab5" dark={d} onUnlock={()=>{ setTab5Unlocked(true); postLog("tab5","manual_unlock","Hazır veri seti ile Tab5 açıldı"); }} /> },
    { id: "tab6", el: (tab2Proceeded || tab5Unlocked)
        ? <Tab6GAN dark={d} onGoTo={setActiveTab} />
        : <GnnGanBlocked id="tab6" dark={d} onUnlock={()=>{ setTab5Unlocked(true); postLog("tab6","manual_unlock","Hazır veri seti ile Tab6 açıldı"); }} /> },
    { id: "admin", el: <TabAdmin dark={d} user={user} /> },
  ];

  return (
    <div className={`flex overflow-x-hidden ${d ? "bg-gray-950" : "bg-gray-50"}`}
         style={{ height: "100dvh", minHeight: "-webkit-fill-available" }}>

      {/* ── Mobil overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`flex flex-col flex-shrink-0 w-64 transition-transform duration-200 ease-in-out
          fixed top-0 left-0 h-full z-50
          md:static md:h-auto md:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          ${d ? "bg-gray-900 border-r border-gray-800" : "bg-white border-r border-gray-200"}
        `}>

        {/* Logo */}
        <div className={`px-4 py-3 border-b ${d ? "border-gray-800" : "border-gray-100"}`}>
          <img src={STING_LOGO} alt="STING"
               className="h-9 object-contain" />
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <p className={`text-xs font-semibold uppercase tracking-wider px-3 py-2 ${d ? "text-gray-600" : "text-gray-400"}`}>{t("pipeline")}</p>
          {TABS.filter(tab => tab.id !== "admin").map((tab, i) => {
            const isActive = activeTab === tab.id;
            const isDone   = (tab.id === "tab1" && project.tab1Result) ||
                             (tab.id === "tab2" && tab2Proceeded)        ||
                             (tab.id === "tab3" && project.tab3Result)   ||
                             (tab.id === "tab4" && project.tab4Result);
            // Tab3-4: Tab2 tamamlanmadan kilitli
            // Tab5-6: Tab2 tamamlanmadan kilitli, ANCAK tab5Unlocked ile bypass edilebilir
            const isLocked =
              (["tab3","tab4","tab5","tab6"].includes(tab.id) && !tab2Proceeded && !tab5Unlocked);
            return (
              <button key={tab.id}
                onClick={() => !isLocked && setActiveTab(tab.id)}
                disabled={isLocked}
                title={isLocked ? (d ? "Önce Tab 2'de parametreleri ayarlayın" : "Önce Tab 2'de parametreleri ayarlayın") : ""}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-sm group ${
                  isLocked
                    ? d ? "opacity-40 cursor-not-allowed" : "opacity-40 cursor-not-allowed"
                    : isActive
                      ? d ? "bg-blue-600/20 text-blue-300" : "bg-blue-50 text-blue-700"
                      : d ? "text-gray-400 hover:bg-gray-800 hover:text-gray-200" : "text-gray-600 hover:bg-gray-50"
                }`}>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  isLocked   ? d ? "bg-gray-800 text-gray-700" : "bg-gray-100 text-gray-300"
                  : isDone   ? d ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-600"
                  : isActive ? d ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-600"
                  : d ? "bg-gray-800 text-gray-500 group-hover:bg-gray-700" : "bg-gray-100 text-gray-400 group-hover:bg-gray-200"
                }`}>
                  {isLocked ? <Icon name="lock" size={12}/> : isDone ? <Icon name="check" size={14} /> : <Icon name={tab.icon} size={15} />}
                </span>
                <span className="flex-1 text-xs leading-tight">{t(tab.shortKey)}</span>
                <span className={`text-xs w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 font-medium ${
                  isActive ? d ? "bg-blue-500/30 text-blue-300" : "bg-blue-100 text-blue-600"
                  : d ? "bg-gray-800 text-gray-600" : "bg-gray-100 text-gray-400"
                }`}>{i + 1}</span>
              </button>
            );
          })}

          {/* Admin / Profile */}
          <div className={`mt-3 pt-3 border-t ${d?"border-gray-800":"border-gray-100"}`}>
            <button onClick={() => setActiveTab("admin")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-sm group ${
                activeTab === "admin"
                  ? d ? "bg-purple-600/20 text-purple-300" : "bg-purple-50 text-purple-700"
                  : d ? "text-gray-400 hover:bg-gray-800 hover:text-gray-200" : "text-gray-600 hover:bg-gray-50"
              }`}>
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                activeTab === "admin"
                  ? d ? "bg-purple-500/20 text-purple-400" : "bg-purple-100 text-purple-600"
                  : d ? "bg-gray-800 text-gray-500" : "bg-gray-100 text-gray-400"
              }`}>
                <Icon name="wrench" size={15} />
              </span>
              <span className="flex-1 text-xs leading-tight">
                {user?.role === "admin" ? "Admin Panel" : "Profil / Loglar"}
              </span>
            </button>
          {/* Anket butonu */}
          <button onClick={() => setShowSurvey(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all
              ${d ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                  : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}
            title={isEN ? "Research Surveys" : "Araştırma Anketleri"}>
            📋 {isEN ? "Survey" : "Anket"}
          </button>
          {/* Hakkında butonu */}
          <button onClick={() => setShowAbout(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all
              ${d ? "border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
                  : "border-indigo-300 text-indigo-700 hover:bg-indigo-50"}`}
            title={isEN ? "About STING" : "STING Hakkında"}>
            ℹ {isEN ? "About" : "Hakkında"}
          </button>
          </div>
        </nav>

        {/* Session */}
        {project.tab1Result && (
          <div className={`mx-3 mb-3 p-3 rounded-xl border ${d ? "bg-green-500/10 border-green-500/20" : "bg-green-50 border-green-200"}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name="check" size={13} className={d ? "text-green-400" : "text-green-600"} />
              <p className={`text-xs font-semibold ${d ? "text-green-400" : "text-green-700"}`}>{t("activeSession")}</p>
            </div>
            <p className={`text-xs font-mono truncate ${d ? "text-green-500" : "text-green-600"}`}>{project.tab1Result.session_id?.slice(0, 16)}…</p>
          </div>
        )}

        {/* User bar */}
        <div className={`p-3 border-t ${d ? "border-gray-800" : "border-gray-100"}`}>
          <div className="flex items-center gap-1 px-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${d ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-600"}`}>
              <Icon name="user" size={15} />
            </div>
            <div className="flex-1 min-w-0 ml-1">
              <p className={`text-xs font-medium truncate ${d ? "text-gray-300" : "text-gray-700"}`}>{user?.full_name || user?.username}</p>
              <p className={`text-xs ${d ? "text-gray-600" : "text-gray-400"}`}>{user?.role}</p>
            </div>
            <button onClick={toggleDark} title={d ? t("lightMode") : t("darkMode")}
              className={`p-1.5 rounded-lg transition-colors ${d ? "text-yellow-400 hover:bg-gray-800" : "text-gray-400 hover:bg-gray-100"}`}>
              <Icon name={d ? "sun" : "moon"} size={15} />
            </button>
            <button onClick={onLogout} title={t("logout")}
              className={`p-1.5 rounded-lg transition-colors ${d ? "text-gray-500 hover:text-red-400 hover:bg-gray-800" : "text-gray-400 hover:text-red-500 hover:bg-red-50"}`}>
              <Icon name="logout" size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header className={`px-3 md:px-6 py-3 flex-shrink-0 z-10 ${d ? "bg-gray-900 border-b border-gray-800" : "bg-white border-b border-gray-200"}`}
                style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <div className="flex items-center justify-between gap-2">

            {/* Sol: hamburger + sekme ikonu + sekme adı */}
            <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
              <button
                className={`p-1.5 rounded-lg transition-colors md:hidden flex-shrink-0 ${d ? "text-gray-400 hover:bg-gray-800" : "text-gray-500 hover:bg-gray-100"}`}
                onClick={() => setSidebarOpen(v => !v)}
                aria-label="Menu"
              >
                <Icon name="menu" size={20} />
              </button>
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${d ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-600"}`}>
                <Icon name={TABS.find(tb => tb.id === activeTab)?.icon} size={14} />
              </span>
              <h1 className={`text-sm font-semibold truncate max-w-[120px] md:max-w-none ${d ? "text-gray-100" : "text-gray-800"}`}>
                {t(TABS.find(tb => tb.id === activeTab)?.labelKey)}
              </h1>
            </div>

            {/* Sağ: toolbar + dil + pill'ler */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Project toolbar — her zaman görünür */}
              <ProjectToolbar project={project} dark={d} />

              {/* Language switcher — her zaman görünür */}
              <div className="flex-shrink-0">
                <LangSwitcher dark={d} />
              </div>

              {/* Step pills — masaüstünde görünür */}
              <div className="hidden md:flex items-center gap-1">
                {TABS.filter(t => t.id !== "admin").map((tab, i) => {
                  const done = (tab.id === "tab1" && project.tab1Result) ||
                               (tab.id === "tab2" && tab2Proceeded)        ||
                               (tab.id === "tab3" && project.tab3Result)   ||
                               (tab.id === "tab4" && project.tab4Result);
                  const active = tab.id === activeTab;
                  return (
                    <div key={tab.id} className="flex items-center gap-1">
                      <button onClick={() => setActiveTab(tab.id)} title={t(tab.labelKey)}
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                          done   ? "bg-green-500 text-white"
                          : active ? "bg-blue-600 text-white"
                          : d    ? "bg-gray-800 text-gray-500 hover:bg-gray-700"
                          : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                        }`}>
                        {done ? <Icon name="check" size={10} /> : i + 1}
                      </button>
                      {i < TABS.filter(t => t.id !== "admin").length - 1 && (
                        <div className={`h-px w-3 rounded-full ${done ? "bg-green-400" : d ? "bg-gray-800" : "bg-gray-200"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </header>

        {/* Content — tab'lar her zaman mount'lu, sadece gizlenir */}
        <div className="flex-1 overflow-hidden relative">
          {tabContent.map(({ id, el }) => (
            <div key={id}
                 ref={node => { if (node) tabScrollRefs.current[id] = node; }}
                 className={`absolute inset-0 overflow-auto p-3 md:p-8 transition-opacity duration-150 ${
                   activeTab === id ? "opacity-100 pointer-events-auto z-10" : "opacity-0 pointer-events-none z-0"
                 }`}
                 style={activeTab === id ? {} : { visibility: "hidden" }}>
              {el}
            </div>
          ))}
        </div>
      </main>
      {showSurvey && (
        <SurveyModal dark={d} onClose={() => setShowSurvey(false)} />
      )}
      {showAbout && (
        <AboutModal dark={d} isEN={isEN} onClose={() => setShowAbout(false)} />
      )}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
export default function App() {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [dark,    setDark]    = useState(() => {
    const saved = localStorage.getItem("sting_theme");
    if (saved) return saved === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  const toggleDark = () => setDark(d => {
    const next = !d;
    localStorage.setItem("sting_theme", next ? "dark" : "light");
    return next;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    const token = localStorage.getItem("sting_token");
    if (!token) { setLoading(false); return; }
    getMe()
      .then(u => setUser(u))
      .catch(() => localStorage.removeItem("sting_token"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${dark ? "bg-gray-950" : "bg-gray-50"}`}>
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin w-8 h-8 text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <p className={`text-sm ${dark ? "text-gray-500" : "text-gray-400"}`}>STING yükleniyor…</p>
        </div>
      </div>
    );
  }

  return (
    <LangProvider>
      <ThemeCtx.Provider value={{ dark, toggle: toggleDark }}>
        {!user
          ? <LoginScreen onLogin={setUser} dark={dark} toggleDark={toggleDark} />
          : <DSSShell
              user={user} dark={dark} toggleDark={toggleDark}
              onLogout={() => { localStorage.removeItem("sting_token"); setUser(null); }}
            />
        }
      </ThemeCtx.Provider>
    </LangProvider>
  );
}
