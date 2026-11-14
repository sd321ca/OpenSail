var e=class extends Error{status;constructor(e,t=0){super(e),this.name=`ApiError`,this.status=t}};function t(e){return e instanceof Error?e.message:String(e??`Unknown error`)}async function n(e){try{let t=await e.json();if(t&&typeof t==`object`&&`detail`in t){let e=t.detail;if(typeof e==`string`)return e;if(e)return JSON.stringify(e)}}catch{}return e.statusText||`Request failed (${e.status})`}async function r(t,r={}){let{method:i=`GET`,body:a,signal:o,headers:s={}}=r,c={method:i,signal:o,headers:{...s}};a!==void 0&&(a instanceof FormData?c.body=a:(c.headers[`Content-Type`]=`application/json`,c.body=JSON.stringify(a)));let l=await fetch(t,c);if(!l.ok)throw new e(await n(l),l.status);return l.status===204?null:(l.headers.get(`content-type`)||``).includes(`application/json`)?await l.json():await l.text()}async function i(t){let r=new FormData;r.append(`file`,t,t.name||`upload`);let i=await fetch(`/api/uploads`,{method:`POST`,body:r});if(!i.ok)throw new e(await n(i),i.status);return await i.json()}async function a(t,r,i,a){let o=await fetch(t,{method:`POST`,headers:{"Content-Type":`application/json`,Accept:`text/event-stream`},body:JSON.stringify(r),signal:a});if(!o.ok)throw new e(await n(o),o.status);if(!o.body)throw new e(`The server returned an empty stream.`);let s=o.body.getReader(),c=new TextDecoder,l=``,u=e=>{for(let t of e.split(/\r?\n\r?\n/)){if(!t.trim())continue;let e=t.split(/\r?\n/).filter(e=>e.startsWith(`data:`)).map(e=>e.slice(5).trimStart()).join(`
`);if(e)try{i(JSON.parse(e))}catch(t){console.error(`Could not parse stream event`,e,t)}}};try{for(;;){let{value:e,done:t}=await s.read();if(t)break;l+=c.decode(e,{stream:!0});let n=l.search(/\r?\n\r?\n/);for(;n>=0;){let e=l.slice(n).match(/^\r?\n\r?\n/),t=e?e[0].length:2;u(l.slice(0,n)),l=l.slice(n+t),n=l.search(/\r?\n\r?\n/)}}l+=c.decode(),l.trim()&&u(l)}finally{s.releaseLock()}}function o(e){return String(e??``).replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}var s={generate:`<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.5"/>`,chat:`<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.6A8.5 8.5 0 1 1 21 12Z"/><path d="M8 11h8M8 15h5"/>`,mic:`<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8"/>`,image:`<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-4.5-4.5L7 21"/>`,music:`<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>`,film:`<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>`,menu:`<path d="M4 7h16M4 12h16M4 17h16"/>`,close:`<path d="M6 6l12 12M18 6 6 18"/>`,upload:`<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>`,gallery:`<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m21 16-5-5L7 21"/><circle cx="8.5" cy="9.5" r="1.4"/>`,trash:`<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13H8L7 7"/><path d="M10 11v5m4-5v5"/>`,pencil:`<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m13.5 7.5 3 3"/>`,crop:`<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>`,scissors:`<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.2 7.4 20 18M8.2 16.6 20 6"/>`,play:`<path d="m8 5 11 7-11 7V5Z"/>`,stop:`<rect x="6" y="6" width="12" height="12" rx="2"/>`,refresh:`<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>`,settings:`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>`,check:`<path d="m5 12.5 4.5 4.5L19 7.5"/>`,alert:`<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3h.01"/>`,info:`<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>`,download:`<path d="M12 4v12m0 0 5-5m-5 5-5-5"/><path d="M5 20h14"/>`,external:`<path d="M14 4h6v6m0-6-9 9"/><path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4"/>`,plus:`<path d="M12 5v14M5 12h14"/>`,send:`<path d="m4 4 17 8-17 8 3-8-3-8Z"/><path d="M7 12h14"/>`,attach:`<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>`,cpu:`<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3m6-3v3M9 20v3m6-3v3M1 9h3m-3 6h3m16-6h3m-3 6h3"/><rect x="9" y="9" width="6" height="6" rx="1"/>`,volume:`<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>`,wand:`<path d="m4 20 10-10m-3-3 6 6"/><path d="M15 3v3m0 0v3m0-3h3m-3 0h-3M5 5v2m0 0v2m0-2h2M5 5H3"/>`,save:`<path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h9V3M7 21v-8h10v8"/>`,folder:`<path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>`,clock:`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,palette:`<path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h4.5A4.5 4.5 0 0 0 21 8.5C21 5.5 17 3 12 3Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="6.5" r="1"/><circle cx="14.5" cy="6.5" r="1"/>`,chevron:`<path d="m7 10 5 5 5-5"/>`,sparkles:`<path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>`,sun:`<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,moon:`<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"/>`};function c(e,t=`h-5 w-5`){return`<svg viewBox="0 0 24 24" class="${t}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${s[e]||s.info}</svg>`}function l(e=`h-4 w-4`){return`<svg class="${e} animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".2" stroke-width="3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`}function u(e){let t=o(e),n=[];return t=t.replace(/`([^`]+)`/g,(e,t)=>{let r=`\u0000INLINE${n.length}\u0000`;return n.push(`<code>${t}</code>`),r}),t=t.replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`),t=t.replace(/__([^_]+)__/g,`<strong>$1</strong>`),t=t.replace(/(^|[\s(])\*([^*\n]+)\*/g,`$1<em>$2</em>`),t=t.replace(/(^|[\s(])_([^_\n]+)_/g,`$1<em>$2</em>`),t=t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,`<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>`),t=t.replace(/\u0000INLINE(\d+)\u0000/g,(e,t)=>n[Number(t)]??``),t}function d(e){if(!e)return``;let t=[],n=String(e).replace(/```([\w+-]*)\r?\n?([\s\S]*?)```/g,(e,n,r)=>{let i=`\u0000BLOCK${t.length}\u0000`;return t.push(`<pre><code>${o(r.replace(/\n$/,``))}</code></pre>`),i}).replace(/\r\n/g,`
`).split(`
`),r=[],i=[],a=null,s=()=>{i.length&&(r.push(`<p>${u(i.join(` `))}</p>`),i=[])},c=()=>{a&&=(r.push(`</${a}>`),null)};for(let e of n){let n=e.trimEnd();if(!n.trim()){s(),c();continue}let o=n.match(/^\u0000BLOCK(\d+)\u0000$/);if(o){s(),c(),r.push(t[Number(o[1])]??``);continue}let l=n.match(/^(#{1,4})\s+(.*)$/);if(l){s(),c();let e=l[1].length;r.push(`<h${e}>${u(l[2])}</h${e}>`);continue}if(/^---+$/.test(n.trim())){s(),c(),r.push(`<hr>`);continue}let d=n.match(/^>\s?(.*)$/);if(d){s(),c(),r.push(`<blockquote>${u(d[1])}</blockquote>`);continue}let f=n.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);if(f){s();let e=/\d+\./.test(f[1])?`ol`:`ul`;a!==e&&(c(),a=e,r.push(`<${e}>`)),r.push(`<li>${u(f[2])}</li>`)}else c(),i.push(n.trim())}return s(),c(),r.join(``)}function f(e){return o(e||``).replace(/\n/g,`<br>`)}function p(e,t=`info`,n=4800){let r=document.getElementById(`toast-root`);if(!r)return;let i={info:`border-sky-400/20 bg-sky-400/10 text-sky-100`,success:`border-emerald-400/20 bg-emerald-400/10 text-emerald-100`,warning:`border-amber-400/20 bg-amber-400/10 text-amber-100`,error:`border-rose-400/20 bg-rose-400/10 text-rose-100`},a={info:`info`,success:`check`,warning:`alert`,error:`alert`},s=document.createElement(`div`);s.className=`toast`,s.setAttribute(`role`,t===`error`?`alert`:`status`),s.innerHTML=`
    <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${i[t]||i.info}">
      ${c(a[t]||`info`,`h-4 w-4`)}
    </span>
    <p class="min-w-0 flex-1 whitespace-pre-wrap break-words">${o(e)}</p>
    <button class="icon-btn -mr-1 -mt-1 h-7 w-7" aria-label="Dismiss">${c(`close`,`h-4 w-4`)}</button>
  `;let l=()=>{s.classList.add(`opacity-0`,`translate-y-1`),s.style.transition=`opacity 160ms ease, transform 160ms ease`,setTimeout(()=>s.remove(),180)};s.querySelector(`button`)?.addEventListener(`click`,l),r.appendChild(s),n&&setTimeout(l,n)}function m({title:e=``,subtitle:t=``,content:n=``,footer:r=null,size:i=`md`,onClose:a=null}={}){let s=document.getElementById(`modal-root`),l=document.createElement(`div`);l.className=`modal-backdrop`,l.innerHTML=`
    <div class="modal-panel ${i===`lg`?`modal-panel-lg`:``}" role="dialog" aria-modal="true" aria-label="${o(e)}">
      <div class="flex shrink-0 items-start gap-3 border-b border-subtle px-4 py-4 sm:px-6">
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold tracking-tight text-slate-100">${o(e)}</h2>
          ${t?`<p class="mt-0.5 text-xs leading-5 text-slate-400">${o(t)}</p>`:``}
        </div>
        <button class="icon-btn -mr-2 h-10 w-10 shrink-0 touch-manipulation sm:h-9 sm:w-9" data-modal-close aria-label="Close">${c(`close`)}</button>
      </div>
      <div class="modal-body" data-modal-body></div>
    </div>
  `;let u=l.querySelector(`.modal-panel`),d=l.querySelector(`[data-modal-body]`);if(!u||!d)throw Error(`Modal template is missing its panel.`);if(n instanceof Node?d.appendChild(n):d.innerHTML=n,r){let e=document.createElement(`div`);e.className=`flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-subtle bg-ink-900/95 px-4 py-3 sm:px-6`,r instanceof Node?e.appendChild(r):e.innerHTML=r,u.appendChild(e)}let f=!1,p=()=>{f||(f=!0,document.removeEventListener(`keydown`,m),document.body.classList.remove(`overflow-hidden`),l.remove(),a?.())},m=e=>{e.key===`Escape`&&p()};return l.querySelector(`[data-modal-close]`)?.addEventListener(`click`,p),l.addEventListener(`mousedown`,e=>{e.target===l&&p()}),document.addEventListener(`keydown`,m),document.body.classList.add(`overflow-hidden`),s?.appendChild(l),setTimeout(()=>{l.querySelector(`input, textarea, select, button:not([data-modal-close])`)?.focus?.({preventScroll:!0})},30),{close:p,element:l,body:d,panel:u}}function h(e,{title:t=`Are you sure?`,confirmLabel:n=`Confirm`,danger:r=!1}={}){return new Promise(i=>{let a=document.createElement(`div`);a.className=`flex items-center justify-end gap-2`,a.innerHTML=`
      <button class="btn-secondary" data-cancel>Cancel</button>
      <button class="${r?`btn-danger`:`btn-primary`}" data-confirm>${o(n)}</button>
    `;let s=!1,c=m({title:t,content:`<p class="text-sm leading-6 text-slate-300">${o(e)}</p>`,footer:a,onClose:()=>{s||i(!1)}});a.querySelector(`[data-cancel]`)?.addEventListener(`click`,()=>{s=!0,c.close(),i(!1)}),a.querySelector(`[data-confirm]`)?.addEventListener(`click`,()=>{s=!0,c.close(),i(!0)})})}function g(e,t,n=`Working…`){e&&(t?(e.dataset.originalHtml=e.innerHTML,e.disabled=!0,e.innerHTML=`${l(`h-4 w-4`)}<span>${o(n)}</span>`):(e.disabled=!1,e.dataset.originalHtml&&(e.innerHTML=e.dataset.originalHtml,delete e.dataset.originalHtml)))}function _(e,t,n){return Math.min(n,Math.max(t,e))}function v(e,t){let n=e.querySelector(t);if(!n)throw Error(`Missing element: ${t}`);return n}function y(e,t,n=`info`){return`
    <div class="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-subtle bg-raised text-slate-500">
        ${c(n,`h-6 w-6`)}
      </div>
      <div>
        <p class="text-sm font-semibold text-slate-200">${o(e)}</p>
        <p class="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">${o(t)}</p>
      </div>
    </div>
  `}var b=.05;function x(e){let t=Math.max(0,e),n=Math.floor(t/60);return`${n}:${(t-n*60).toFixed(1).padStart(4,`0`)}`}function S(e){return`${String(e||`audio`).replace(/\.[^./\\]+$/,``)||`audio`}-trim.wav`}function C(e,t,n){for(let r=0;r<n.length;r+=1)e.setUint8(t+r,n.charCodeAt(r))}function w(e,t,n){let r=Math.max(0,Math.floor(t*e.sampleRate)),i=Math.min(e.length,Math.ceil(n*e.sampleRate)),a=Math.max(1,i-r),o=Math.max(1,Math.min(2,e.numberOfChannels)),s=e.sampleRate,c=o*2,l=a*c,u=new ArrayBuffer(44+l),d=new DataView(u);C(d,0,`RIFF`),d.setUint32(4,36+l,!0),C(d,8,`WAVE`),C(d,12,`fmt `),d.setUint32(16,16,!0),d.setUint16(20,1,!0),d.setUint16(22,o,!0),d.setUint32(24,s,!0),d.setUint32(28,s*c,!0),d.setUint16(32,c,!0),d.setUint16(34,16,!0),C(d,36,`data`),d.setUint32(40,l,!0);let f=[];for(let t=0;t<o;t+=1)f.push(e.getChannelData(t));let p=44;for(let e=r;e<r+a;e+=1)for(let t=0;t<o;t+=1){let n=Math.max(-1,Math.min(1,f[t][e]||0));d.setInt16(p,n<0?n*32768:n*32767,!0),p+=2}return new Blob([u],{type:`audio/wav`})}function T(e,t){let n=Math.max(1,Math.min(2,e.numberOfChannels)),r=[];for(let t=0;t<n;t+=1)r.push(e.getChannelData(t));let i=r[0],a=Math.max(1,Math.floor(i.length/t)),o=[];for(let e=0;e<t;e+=1){let t=e*a,n=Math.min(i.length,t+a),s=0,c=0;for(let e=t;e<n;e+=1)for(let t=0;t<r.length;t+=1){let n=r[t][e];n<s&&(s=n),n>c&&(c=n)}o.push([s,c])}return o}function E(e,t,n,r){let i=e.getBoundingClientRect(),a=Math.max(1,Math.round(i.width)),o=Math.max(1,Math.round(i.height)),s=window.devicePixelRatio||1;e.width=Math.round(a*s),e.height=Math.round(o*s);let c=e.getContext(`2d`);if(!c)return;c.setTransform(s,0,0,s,0,0),c.clearRect(0,0,a,o);let l=o/2,u=Math.max(1,o/2-2),d=(e,n,r)=>{c.strokeStyle=r,c.beginPath();for(let r=Math.max(0,e);r<n;r+=1){let[e,n]=t[r]??[0,0];c.moveTo(r+.5,l+e*u),c.lineTo(r+.5,l+n*u)}c.stroke()};d(0,a,`rgba(148, 163, 184, 0.42)`),d(Math.round(n*a),Math.round(r*a),`#818cf8`),c.strokeStyle=`rgba(148, 163, 184, 0.16)`,c.beginPath(),c.moveTo(0,l+.5),c.lineTo(a,l+.5),c.stroke()}async function D({source:e,name:n=`audio`,title:r=`Trim audio`,subtitle:i=`Choose the part of the clip to keep before uploading.`,onApply:a}){let s=e instanceof Blob,u=s?URL.createObjectURL(e):e,d=s,f=null,h=null,_=0,v=null,y=null,C=null,D=null,O=null,k=null,A=null,j=null,M=null,N=0,P=0,F=null,I=!1,L=null,R=!1,z=m({title:r,subtitle:i,size:`lg`,content:`<div class="flex min-h-40 items-center justify-center text-slate-500">${l(`h-6 w-6`)}</div>`,footer:`
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <button class="btn-secondary" data-audio-cancel>Cancel</button>
        <button class="btn-primary" data-audio-apply disabled>${c(`check`,`h-4 w-4`)} Apply trim</button>
      </div>
    `,onClose:()=>{R=!0,F?.pause(),I&&=!1,d&&u&&URL.revokeObjectURL(u),d=!1,L&&window.removeEventListener(`resize`,L),L=null}}),B=z.element.querySelector(`[data-audio-apply]`);z.element.querySelector(`[data-audio-cancel]`)?.addEventListener(`click`,()=>z.close()),B?.addEventListener(`click`,async()=>{if(a){g(B,!0,`Applying…`);try{let t=null;if(!f)t=h;else{let r=Math.min(b,_||b),i=Math.max(0,Math.min(N,_)),a=Math.min(_,Math.max(P,i));if(a-i<r){p(`Choose a longer section to keep.`,`warning`),g(B,!1);return}if(i<=.005&&a>=_-.005&&e instanceof File)t=e;else{let e=w(f,i,a);t=new File([e],S(n),{type:`audio/wav`})}}if(!t){g(B,!1);return}await a(t),z.close()}catch(e){p(t(e)||`Could not use the trimmed audio.`,`error`),g(B,!1)}}});let V=(e,t)=>{h=e,z.body.innerHTML=`
      <div class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm leading-6 text-rose-200">
        <p class="font-medium">Could not decode this audio for trimming.</p>
        <p class="mt-1 text-xs text-rose-200/80">${o(t)}</p>
        ${e?`<p class="mt-2 text-xs text-rose-200/80">You can still use the original file without trimming.</p>`:`<p class="mt-2 text-xs text-rose-200/80">Choose another file, or use a WAV, MP3, OGG or M4A clip.</p>`}
      </div>
    `,B&&e&&(B.disabled=!1,B.innerHTML=`${c(`upload`,`h-4 w-4`)} Use original`)};try{let t=s?await e.arrayBuffer():await(await fetch(e)).arrayBuffer(),n=window.AudioContext||window.webkitAudioContext;if(!n)throw Error(`Web Audio is not available in this browser.`);let r=new n;try{f=await r.decodeAudioData(t)}finally{r.close?.().catch(()=>{})}if(_=f.duration,!Number.isFinite(_)||_<=0)throw Error(`The audio file is empty.`)}catch(r){if(R)return;h=s?e instanceof File?e:new File([e],n,{type:e.type||`application/octet-stream`}):null,V(h,t(r)||`The browser could not read this file.`);return}if(R)return;z.body.innerHTML=`
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-3 rounded-xl border border-subtle bg-raised px-3 py-2">
        <span class="min-w-0 truncate text-[11px] text-slate-500">Source: ${o(n)}</span>
        <span class="shrink-0 font-mono text-[11px] text-slate-400">${x(_)}</span>
      </div>
      <audio class="w-full" controls preload="metadata" src="${o(u)}" data-audio-preview></audio>
      <div class="relative overflow-hidden rounded-xl border border-subtle bg-ink-950">
        <canvas class="block h-24 w-full" data-audio-waveform></canvas>
        <div class="pointer-events-none absolute inset-y-0 left-0 bg-black/55" data-shade-left></div>
        <div class="pointer-events-none absolute inset-y-0 right-0 bg-black/55" data-shade-right></div>
        <div class="pointer-events-none absolute inset-y-0 border-x-2 border-accent-400/80" data-audio-selection></div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="mb-1 flex items-center justify-between text-[11px] text-slate-500"><span>Start</span><span class="font-mono text-slate-300" data-start-label></span></span>
          <input type="range" min="0" step="0.01" class="w-full accent-accent-500" data-start />
        </label>
        <label class="block">
          <span class="mb-1 flex items-center justify-between text-[11px] text-slate-500"><span>End</span><span class="font-mono text-slate-300" data-end-label></span></span>
          <input type="range" min="0" step="0.01" class="w-full accent-accent-500" data-end />
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn-ghost btn-xs" data-play-selection>${c(`play`,`h-3.5 w-3.5`)} Play selection</button>
        <button type="button" class="btn-ghost btn-xs" data-reset-selection>${c(`refresh`,`h-3.5 w-3.5`)} Reset</button>
        <span class="ml-auto text-[11px] text-slate-500" data-selection-length></span>
      </div>
    </div>
  `;let H=f;if(!H)return;F=z.body.querySelector(`[data-audio-preview]`),j=z.body.querySelector(`[data-audio-waveform]`),v=z.body.querySelector(`[data-start]`),y=z.body.querySelector(`[data-end]`),C=z.body.querySelector(`[data-start-label]`),D=z.body.querySelector(`[data-end-label]`),O=z.body.querySelector(`[data-shade-left]`),k=z.body.querySelector(`[data-shade-right]`),A=z.body.querySelector(`[data-audio-selection]`);let U=z.body.querySelector(`[data-selection-length]`),W=Math.min(b,_);v&&(v.max=String(Math.max(0,_-W))),y&&(y.max=String(_)),v&&(v.value=`0`),y&&(y.value=String(_)),N=0,P=_;let ee=()=>{if(!j)return;let e=Math.max(1,Math.round(j.getBoundingClientRect().width));M&&M.width===e||(M={width:e,values:T(H,e)}),E(j,M.values,_?N/_:0,_?P/_:1)},te=()=>{let e=_?N/_*100:0,t=_?P/_*100:100;O&&(O.style.width=`${e}%`),k&&(k.style.left=`${t}%`),A&&(A.style.left=`${e}%`,A.style.width=`${Math.max(0,t-e)}%`),C&&(C.textContent=x(N)),D&&(D.textContent=x(P)),U&&(U.textContent=`Keeping ${x(Math.max(0,P-N))}`),ee()};v?.addEventListener(`input`,()=>{v&&(N=Math.max(0,Math.min(Number(v.value),P-W)),v.value=String(N),te())}),y?.addEventListener(`input`,()=>{y&&(P=Math.min(_,Math.max(Number(y.value),N+W)),y.value=String(P),te())}),z.body.querySelector(`[data-reset-selection]`)?.addEventListener(`click`,()=>{N=0,P=_,v&&(v.value=`0`),y&&(y.value=String(_)),te()}),z.body.querySelector(`[data-play-selection]`)?.addEventListener(`click`,async()=>{if(F){I=!0,F.currentTime=N;try{await F.play()}catch(e){I=!1,p(t(e)||`Could not play the clip.`,`error`)}}}),F?.addEventListener(`timeupdate`,()=>{F&&I&&F.currentTime>=P-.02&&(I=!1,F.pause(),F.currentTime=Math.min(P,_))}),F?.addEventListener(`pause`,()=>{I=!1}),F?.addEventListener(`ended`,()=>{I=!1}),B&&(B.innerHTML=`${c(`check`,`h-4 w-4`)} Apply trim`,B.disabled=!1),te(),L=()=>{M=null,ee()},window.addEventListener(`resize`,L)}var O={image:`Image`,audio:`Audio`,video:`Video`};function k(e){return`/api/workflows/${encodeURIComponent(e)}`}function A(e,t){let n=new Set((e?.candidates||[]).map(e=>e.id));return Object.fromEntries(Object.entries(t||{}).filter(([e])=>n.has(e)))}function j(e,t){let n=new Set(e?.selected||[]);return Object.fromEntries(Object.entries(t||{}).filter(([e])=>n.has(e)))}function M(e){return e?e.upload?{upload:e.upload,gallery:null}:e.gallery?{upload:null,gallery:{filename:e.gallery.filename,subfolder:e.gallery.subfolder||``,type:e.gallery.type||`output`}}:null:null}var N={running:!1,result:null,error:``,progress:null,workflow:null,startedAt:0,elapsedMs:0,doneAt:0,listeners:new Set},P=500,F=null,I=!1;function L(){return N.running&&N.startedAt?performance.now()-N.startedAt:N.elapsedMs}function R(){return{running:N.running,result:N.result,error:N.error,progress:N.progress,workflow:N.workflow,elapsedMs:L(),doneAt:N.doneAt}}function z(){let e=R();for(let t of[...N.listeners])try{t(e)}catch(e){console.error(e)}}function B(e){return N.listeners.add(e),e(R()),()=>{N.listeners.delete(e)}}function V(){N.startedAt&&=(N.elapsedMs=performance.now()-N.startedAt,0),N.running=!1}function H(){F&&clearTimeout(F),F=null}function U(e=P){F&&clearTimeout(F),F=setTimeout(()=>{ee()},e)}function W(e){let t=N.running,n=N.error,r=Number(e.elapsed_ms)||0;N.running=!!e.running,N.workflow=e.workflow||null,N.error=e.error||``,N.result=e.result||null,N.progress=e.progress?{value:Number(e.progress.value)||0,message:e.progress.message||``,indeterminate:!!e.progress.indeterminate}:null,N.running?(N.startedAt=performance.now()-r,N.elapsedMs=r,N.doneAt=0):(N.startedAt=0,N.elapsedMs=r,!N.error&&N.result?(N.progress={value:1,message:`Done.`,indeterminate:!1},t&&(N.doneAt=performance.now())):N.doneAt=0),t&&N.error&&N.error!==n&&p(N.error,N.error===`Generation cancelled.`?`warning`:`error`),z(),N.running?U():H()}async function ee(){if(F=null,N.running){if(I)U();else{I=!0;try{W(await r(`/api/generate/status`))}catch{N.running&&U(P*2)}finally{I=!1}}}}async function te(){if(I)return U(0),R();I=!0;try{W(await r(`/api/generate/status`))}catch{N.running&&U(P*2)}finally{I=!1}return R()}async function ne(e){H(),N.running=!0,N.result=null,N.error=``,N.workflow=e.workflow||null,N.progress={value:0,message:`Preparing…`,indeterminate:!0},N.startedAt=performance.now(),N.elapsedMs=0,N.doneAt=0,z();try{W(await r(`/api/generate`,{method:`POST`,body:e}))}catch(e){if(e.status===409)try{W(await r(`/api/generate/status`));return}catch{}N.error=t(e)||`Generation failed.`,V(),p(N.error,`error`),z()}}document.addEventListener(`visibilitychange`,()=>{document.visibilityState===`visible`&&te()});async function G(e,n){await te();let a=n.boot;if(!a)throw Error(`Generate page requires the bootstrap payload.`);let s=a.workflows||[],u=null,f=a.default_workflow||s[0]?.name||null;N.workflow&&(N.running||N.result||N.error)&&(f=N.workflow);let b=!0,x=null,S=!1,C=!!f&&N.workflow===f,w={values:{},images:[],audio:null,video:null,running:N.running,result:C?N.result:null,error:C?N.error:``,elapsedMs:L(),timer:null,unsubscribe:null};e.innerHTML=`
    <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,500px)_minmax(0,1fr)]">
      <div class="min-w-0 space-y-5">
        <section class="card">
          <div class="card-header">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500/10 text-accent-300">${c(`sparkles`,`h-4 w-4`)}</span>
              <div>
                <h2 class="card-title">Workflow</h2>
                <p class="card-subtitle" data-workflow-summary>Loading…</p>
              </div>
            </div>
            <span class="chip" data-kind-chip>—</span>
          </div>
          <div class="space-y-3 p-4 sm:p-5">
            ${s.length?`<select class="select" data-workflow-select aria-label="Workflow">
                    ${s.map(e=>`<option value="${o(e.name)}">${o(e.label)}</option>`).join(``)}
                  </select>`:`<div class="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">No workflows were found in the <code class="font-mono">workflows/</code> folder.</div>`}
            <div class="flex flex-wrap gap-2">
              <button class="btn-secondary btn-xs" data-choose-inputs>${c(`settings`,`h-4 w-4`)} Choose inputs</button>
              <button class="btn-ghost btn-xs" data-reload-workflow>${c(`refresh`,`h-4 w-4`)} Refresh</button>
            </div>
          </div>
        </section>

        <section class="card hidden" data-presets-card></section>

        <section class="card hidden" data-inputs-card></section>

        <section class="card hidden" data-notes-card></section>

        <section class="card">
          <div class="card-header">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300">${c(`settings`,`h-4 w-4`)}</span>
              <div>
                <h2 class="card-title">Parameters</h2>
                <p class="card-subtitle" data-controls-summary>—</p>
              </div>
            </div>
          </div>
          <div class="space-y-4 p-4 sm:p-5" data-controls></div>
        </section>

        <section class="card">
          <div class="space-y-3 p-4 sm:p-5">
            <div class="flex flex-wrap items-center gap-2">
              <button class="btn-primary min-w-[9rem] flex-1" data-generate>${c(`play`,`h-4 w-4`)} Generate</button>
              <button class="btn-danger min-w-[7rem] flex-1" data-stop disabled>${c(`stop`,`h-4 w-4`)} Stop</button>
            </div>
            <div class="hidden space-y-2" data-progress-wrap>
              <div class="flex items-center justify-between gap-3 text-xs">
                <span class="truncate text-slate-400" data-progress-label>Preparing…</span>
                <span class="flex shrink-0 items-center gap-2 font-mono text-slate-500">
                  <span data-progress-time></span>
                  <span data-progress-percent></span>
                </span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div class="h-full w-0 rounded-full bg-gradient-to-r from-accent-500 to-sky-400 transition-all duration-300" data-progress-bar></div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="min-w-0 space-y-5 xl:sticky xl:top-24 xl:self-start">
        <section class="card overflow-hidden">
          <div class="card-header">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">${c(`image`,`h-4 w-4`)}</span>
              <div>
                <h2 class="card-title">Output</h2>
                <p class="card-subtitle" data-result-subtitle>Nothing generated yet.</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="chip hidden" data-result-time title="Generation time"></span>
              <a class="btn-ghost btn-xs hidden" data-result-open target="_blank" rel="noopener noreferrer">${c(`external`,`h-4 w-4`)} Open</a>
            </div>
          </div>
          <div class="p-4 sm:p-5" data-result></div>
        </section>
      </div>
    </div>
  `;let T=t=>v(e,t),E=e.querySelector(`[data-workflow-select]`),P=T(`[data-presets-card]`),F=T(`[data-inputs-card]`),I=T(`[data-notes-card]`),R=T(`[data-controls]`),V=T(`[data-result]`),H=T(`[data-generate]`),W=T(`[data-stop]`),ee=T(`[data-progress-wrap]`),G=T(`[data-progress-bar]`),re=T(`[data-progress-label]`),ie=T(`[data-progress-percent]`),ae=T(`[data-progress-time]`),K=T(`[data-result-time]`),oe=T(`[data-result-open]`);E&&(E.value=f||``);function se(e,t,n=!1){if(ee.classList.remove(`hidden`),re.textContent=typeof t==`string`?t:``,n)G.classList.add(`animate-pulse`),G.style.width=`38%`,G.style.transform=`translateX(0)`,ie.textContent=``;else{G.classList.remove(`animate-pulse`),G.style.transform=`none`;let t=Number(e)||0,n=Math.round(Math.max(0,Math.min(1,t))*100);G.style.width=`${n}%`,ie.textContent=`${n}%`}}function ce(){ee.classList.add(`hidden`),G.style.width=`0%`,ie.textContent=``,ae.textContent=``}function q(e){let t=Math.max(0,e)/1e3;if(t<60)return`${t.toFixed(1)}s`;let n=Math.floor(t/60),r=Math.floor(t%60);return`${n}m ${String(r).padStart(2,`0`)}s`}function le(e){if(!K)return;if(!e){K.classList.add(`hidden`),K.textContent=``;return}let t=q(e);K.innerHTML=`${c(`clock`,`h-3 w-3`)} ${t}`,K.title=`Generation time: ${t}`,K.classList.remove(`hidden`)}function ue(){w.timer||=setInterval(()=>{N.running&&(ae.textContent=q(L()))},200),ae.textContent=q(L())}function de(){w.timer&&=(clearInterval(w.timer),null)}let fe=``;function pe(e){let t=!!f&&e.workflow===f,n=t?e.result:null,r=t?e.error:``;w.running=e.running,w.result=n,w.error=r,w.elapsedMs=e.elapsedMs;let i=[e.running,r,n?.url||``,n?.kind||``].join(`|`);i!==fe&&(fe=i,je(),J());let a=!e.running&&e.doneAt&&e.progress?.message===`Done.`&&performance.now()-e.doneAt<1400;e.running?(se(e.progress?.value,e.progress?.message,!!e.progress?.indeterminate),ue()):a?(se(1,`Done.`,!1),de(),ae.textContent=q(e.elapsedMs),setTimeout(()=>{N.running||ce()},Math.max(0,1400-(performance.now()-e.doneAt)))):(de(),ce())}function J(){if(w.error){oe.classList.add(`hidden`),le(0),T(`[data-result-subtitle]`).textContent=w.elapsedMs?`${w.error===`Generation cancelled.`?`Cancelled`:`Generation failed`} after ${q(w.elapsedMs)}.`:`Generation failed.`,V.innerHTML=`
        <div class="rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-5">
          <div class="flex items-start gap-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">${c(`alert`,`h-5 w-5`)}</span>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-rose-100">Generation failed</p>
              <p class="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-rose-200/80">${o(w.error)}</p>
            </div>
          </div>
        </div>
      `;return}if(w.running){oe.classList.add(`hidden`),le(0),T(`[data-result-subtitle]`).textContent=`Working…`,V.innerHTML=`
        <div class="flex min-h-[22rem] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-subtle bg-white/[0.015]">
          <div class="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-accent-400/20 bg-accent-500/10 text-accent-300">
            ${l(`h-7 w-7`)}
          </div>
          <div class="text-center">
            <p class="text-sm font-medium text-slate-200">Generating</p>
            <p class="mt-1 text-xs text-slate-500">The result will appear here when ComfyUI finishes.</p>
          </div>
        </div>
      `;return}if(!w.result){oe.classList.add(`hidden`),le(0),T(`[data-result-subtitle]`).textContent=`Nothing generated yet.`,V.innerHTML=y(`Ready when you are`,`Set your inputs, then press Generate. Results stay available here until you start another run.`,`sparkles`);return}let e=w.result;le(w.elapsedMs),T(`[data-result-subtitle]`).textContent=e.filename||`Generated result`,oe.href=e.url||``,oe.classList.remove(`hidden`),e.kind===`image`?V.innerHTML=`
        <a href="${o(e.url)}" target="_blank" rel="noopener noreferrer" class="group relative block overflow-hidden rounded-2xl border border-subtle bg-ink-950">
          <img src="${o(e.url)}" alt="${o(e.filename||`Generated image`)}" class="max-h-[72vh] w-full object-contain transition duration-300 group-hover:scale-[1.005]" />
          <span class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent p-3 text-[11px] text-white/70 opacity-0 transition group-hover:opacity-100">
            <span class="truncate">${o(e.filename||``)}</span>
            <span class="inline-flex items-center gap-1">Open full size ${c(`external`,`h-3.5 w-3.5`)}</span>
          </span>
        </a>
      `:e.kind===`audio`?V.innerHTML=`
        <div class="rounded-2xl border border-subtle bg-raised p-5">
          <div class="mb-4 flex items-center gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">${c(`music`,`h-5 w-5`)}</span>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-slate-200">${o(e.filename||`Generated audio`)}</p>
              <p class="text-xs text-slate-500">Audio result</p>
            </div>
          </div>
          <audio class="w-full" controls src="${o(e.url)}"></audio>
        </div>
      `:V.innerHTML=`
        <div class="overflow-hidden rounded-2xl border border-subtle bg-ink-950">
          <video class="max-h-[72vh] w-full" controls playsinline src="${o(e.url)}"></video>
          <div class="flex items-center justify-between gap-3 border-t border-subtle px-4 py-3">
            <p class="truncate text-xs text-slate-400">${o(e.filename||`Generated video`)}</p>
            <a class="btn-ghost btn-xs" href="${o(e.url)}" download>${c(`download`,`h-4 w-4`)} Download</a>
          </div>
        </div>
      `}function me(){if(!u)return;let e=u.selected.length;T(`[data-workflow-summary]`).textContent=`${e} input${e===1?``:`s`} · ${u.saved_selection?`custom selection`:`all inputs`}`;let t=T(`[data-kind-chip]`);t.textContent=O[u.kind]||`Image`,t.className=`chip ${u.kind===`audio`?`chip-warn`:u.kind===`video`?`chip-success`:``}`}function he(){u?(I.classList.remove(`hidden`),I.innerHTML=`
      <div class="card-header">
        <button type="button" class="flex min-w-0 flex-1 items-center gap-2.5 text-left" data-notes-toggle aria-expanded="${S?`false`:`true`}" aria-controls="workflow-notes-body">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300">${c(`info`,`h-4 w-4`)}</span>
          <span class="min-w-0">
            <span class="card-title block">Workflow notes</span>
            <span class="card-subtitle block">Tips saved for this workflow</span>
          </span>
          <span class="ml-auto shrink-0 text-slate-500 transition-transform ${S?``:`rotate-180`}" data-notes-chevron>${c(`chevron`,`h-4 w-4`)}</span>
        </button>
        <button class="btn-ghost btn-xs" data-edit-notes>${c(`pencil`,`h-4 w-4`)} Edit</button>
      </div>
      <div id="workflow-notes-body" data-notes-body class="${S?`hidden`:``}">
        ${u.notes?`<div class="prose-notes p-4 sm:p-5">${d(u.notes)}</div>`:`<p class="p-4 text-sm text-slate-500 sm:p-5">No notes for this workflow yet. Use Edit to add tips.</p>`}
      </div>
    `,I.querySelector(`[data-edit-notes]`)?.addEventListener(`click`,Ae),I.querySelector(`[data-notes-toggle]`)?.addEventListener(`click`,()=>{S=!S,I.querySelector(`[data-notes-body]`)?.classList.toggle(`hidden`,S);let e=I.querySelector(`[data-notes-toggle]`);e?.setAttribute(`aria-expanded`,String(!S)),e?.querySelector(`[data-notes-chevron]`)?.classList.toggle(`rotate-180`,!S)})):(I.classList.add(`hidden`),I.innerHTML=``)}function ge(){if(!u)return;let e=u;P.classList.remove(`hidden`);let n=e.preset_names||[];x&&n.includes(x)||(x=e.default_preset||n[0]||``),P.innerHTML=`
      <details class="group" ${n.length?``:`open`}>
        <summary class="card-header cursor-pointer list-none select-none">
          <div class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">${c(`save`,`h-4 w-4`)}</span>
            <div>
              <h2 class="card-title">Input presets</h2>
              <p class="card-subtitle">${n.length?`${n.length} saved preset${n.length===1?``:`s`}`:`Save your current values for later`}</p>
            </div>
          </div>
          <span class="text-slate-500 transition group-open:rotate-180">${c(`chevron`,`h-4 w-4`)}</span>
        </summary>
        <div class="space-y-3 border-t border-subtle p-4 sm:p-5">
          <div class="flex gap-2">
            <select class="select min-w-0 flex-1" data-preset-select aria-label="Saved preset">
              ${n.length?n.map(t=>`<option value="${o(t)}" ${t===x?`selected`:``}>${o(t)}${t===e.default_preset?` (default)`:``}</option>`).join(``):`<option value="">No presets yet</option>`}
            </select>
            <button class="btn-secondary btn-xs shrink-0" data-preset-load ${n.length?``:`disabled`}>Load</button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn-ghost btn-xs" data-preset-default ${n.length?``:`disabled`}>${c(`check`,`h-4 w-4`)} Set default</button>
            <button class="btn-ghost btn-xs text-rose-300 hover:bg-rose-500/10" data-preset-delete ${n.length?``:`disabled`}>${c(`trash`,`h-4 w-4`)} Delete</button>
          </div>
          <div class="flex gap-2 border-t border-subtle pt-3">
            <input class="input min-w-0 flex-1" data-preset-name placeholder="New preset name, e.g. High quality" />
            <button class="btn-primary btn-xs shrink-0" data-preset-save>${c(`save`,`h-4 w-4`)} Save</button>
          </div>
          <p class="text-[11px] leading-5 text-slate-500">Leave the name blank to overwrite the selected preset.</p>
        </div>
      </details>
    `;let i=P.querySelector(`[data-preset-select]`);i?.addEventListener(`change`,()=>{x=i.value}),P.querySelector(`[data-preset-load]`)?.addEventListener(`click`,()=>{if(!u||!x){p(`Choose a preset first.`,`warning`);return}let e=u.presets[x];if(!e)p(`Choose a preset first.`,`warning`);else{for(let t of u.candidates)Object.prototype.hasOwnProperty.call(e,t.id)&&(w.values[t.id]=e[t.id]);Oe(),p(`Loaded preset “${x}”.`,`success`)}}),P.querySelector(`[data-preset-save]`)?.addEventListener(`click`,async e=>{let n=P.querySelector(`[data-preset-name]`)?.value.trim()||x;if(!n||!u){p(`Type a preset name first.`,`warning`);return}let i=e.currentTarget;g(i,!0,`Saving…`);try{let e=await r(`${k(u.name)}/presets`,{method:`POST`,body:{name:n,values:j(u,w.values)}});x=n,$(e,{preserve:!0}),p(`Saved preset “${n}”.`,`success`)}catch(e){p(t(e),`error`)}finally{g(i,!1)}}),P.querySelector(`[data-preset-default]`)?.addEventListener(`click`,async()=>{if(x&&u)try{$(await r(`${k(u.name)}/presets/default`,{method:`POST`,body:{name:x}}),{preserve:!0}),p(`“${x}” will load automatically.`,`success`)}catch(e){p(t(e),`error`)}}),P.querySelector(`[data-preset-delete]`)?.addEventListener(`click`,async()=>{if(x&&u&&await h(`Delete the preset “${x}”?`,{title:`Delete preset`,confirmLabel:`Delete`,danger:!0}))try{let e=await r(`${k(u.name)}/presets/delete`,{method:`POST`,body:{name:x}});x=e.default_preset||e.preset_names[0]||``,$(e,{preserve:!0}),p(`Preset deleted.`,`success`)}catch(e){p(t(e),`error`)}})}function Y(){if(!u)return;let e=u,t=e.image_nodes.length>0,n=e.audio_nodes.length>0,r=e.video_nodes.length>0;if(!t&&!n&&!r){F.classList.add(`hidden`),F.innerHTML=``;return}F.classList.remove(`hidden`);let i=[];t&&i.push(`
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Input images</h3>
            <span class="text-[11px] text-slate-600">Upload, crop, sketch or pick from the gallery</span>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            ${e.image_nodes.map((e,t)=>_e(e,t)).join(``)}
          </div>
        </div>
      `),n&&i.push(`
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Reference audio</h3>
            <span class="text-[11px] text-slate-600">${o(e.audio_nodes[0]?.label)}</span>
          </div>
          ${ve()}
        </div>
      `),r&&i.push(`
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Input video</h3>
            <span class="text-[11px] text-slate-600">${o(e.video_nodes[0]?.label)}</span>
          </div>
          ${ye()}
        </div>
      `),F.innerHTML=`
      <div class="card-header">
        <div class="flex items-center gap-2.5">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300">${c(`image`,`h-4 w-4`)}</span>
          <div>
            <h2 class="card-title">Inputs</h2>
            <p class="card-subtitle">Files are uploaded to ComfyUI when you generate.</p>
          </div>
        </div>
      </div>
      <div class="space-y-5 p-4 sm:p-5">${i.join(``)}</div>
    `,e.image_nodes.forEach((e,t)=>{let n=F.querySelector(`[data-image-slot="${t}"]`);n&&(n.querySelector(`[data-image-upload]`)?.addEventListener(`change`,e=>{let n=e.target.files?.[0];n&&be(n,t)}),n.querySelector(`[data-image-sketch]`)?.addEventListener(`click`,()=>Te(t)),n.querySelector(`[data-image-crop]`)?.addEventListener(`click`,()=>Ee(t)),n.querySelector(`[data-image-gallery]`)?.addEventListener(`click`,()=>Se(t)),n.querySelector(`[data-image-clear]`)?.addEventListener(`click`,()=>{w.images[t]=null,Y()}))}),F.querySelector(`[data-audio-upload]`)?.addEventListener(`change`,e=>{let t=e.target,n=t.files?.[0];t.value=``,n&&X(n)}),F.querySelector(`[data-audio-trim]`)?.addEventListener(`click`,Z),F.querySelector(`[data-audio-gallery]`)?.addEventListener(`click`,we),F.querySelector(`[data-audio-clear]`)?.addEventListener(`click`,()=>{w.audio=null,Y()}),F.querySelector(`[data-video-upload]`)?.addEventListener(`change`,e=>{let t=e.target.files?.[0];t&&xe(t,e=>{w.video=e},`Video`)}),F.querySelector(`[data-video-gallery]`)?.addEventListener(`click`,Ce),F.querySelector(`[data-video-clear]`)?.addEventListener(`click`,()=>{w.video=null,Y()})}function _e(e,t){let n=w.images[t],r=n?`<img src="${o(n.previewUrl)}" alt="${o(e.label)}" class="h-full w-full object-contain" />`:`<div class="flex h-full flex-col items-center justify-center gap-2 text-slate-600">
           ${c(`image`,`h-7 w-7`)}
           <span class="text-[11px]">No image selected</span>
         </div>`;return`
      <div class="rounded-xl border border-subtle bg-raised p-3" data-image-slot="${t}">
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="truncate text-xs font-semibold text-slate-300">${o(e.label)}</p>
          <span class="text-[10px] font-mono text-slate-600">${o(e.id)}</span>
        </div>
        <div class="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-subtle bg-ink-950/80">
          ${r}
        </div>
        <div class="flex flex-wrap gap-1.5">
          <label class="btn-secondary btn-xs cursor-pointer">
            ${c(`upload`,`h-3.5 w-3.5`)} Upload
            <input type="file" accept="image/*" class="sr-only" data-image-upload />
          </label>
          <button class="btn-ghost btn-xs" data-image-sketch>${c(`pencil`,`h-3.5 w-3.5`)} Sketch</button>
          ${n?`<button class="btn-ghost btn-xs" data-image-crop>${c(`crop`,`h-3.5 w-3.5`)} Crop</button>`:``}
          <button class="btn-ghost btn-xs" data-image-gallery>${c(`gallery`,`h-3.5 w-3.5`)} Gallery</button>
          ${n?`<button class="btn-ghost btn-xs text-rose-300 hover:bg-rose-500/10" data-image-clear>${c(`trash`,`h-3.5 w-3.5`)}</button>`:``}
        </div>
      </div>
    `}function ve(){let e=w.audio;return`
      <div class="rounded-xl border border-subtle bg-raised p-3">
        ${e?`<audio class="mb-3 w-full" controls src="${o(e.previewUrl)}"></audio>`:``}
        <div class="flex flex-wrap items-center gap-2">
          <label class="btn-secondary btn-xs cursor-pointer">
            ${c(`upload`,`h-3.5 w-3.5`)} ${e?`Replace audio`:`Upload audio`}
            <input type="file" accept="audio/*" class="sr-only" data-audio-upload />
          </label>
          <button class="btn-ghost btn-xs" data-audio-gallery>${c(`gallery`,`h-3.5 w-3.5`)} Gallery</button>
          ${e?`<button class="btn-ghost btn-xs" data-audio-trim>${c(`scissors`,`h-3.5 w-3.5`)} Trim</button>`:``}
          ${e?`<span class="min-w-0 flex-1 truncate text-[11px] text-slate-500">${o(e.name||`Audio selected`)}</span>`:`<span class="text-[11px] text-slate-600">No reference audio selected</span>`}
          ${e?`<button class="btn-ghost btn-xs text-rose-300 hover:bg-rose-500/10" data-audio-clear>${c(`trash`,`h-3.5 w-3.5`)}</button>`:``}
        </div>
      </div>
    `}function ye(){let e=w.video;return`
      <div class="rounded-xl border border-subtle bg-raised p-3">
        ${e?`<video class="mb-3 max-h-64 w-full rounded-lg bg-ink-950" controls src="${o(e.previewUrl)}"></video>`:`<div class="mb-3 flex aspect-video items-center justify-center rounded-lg border border-dashed border-subtle bg-ink-950/60 text-slate-600">${c(`film`,`h-7 w-7`)}</div>`}
        <div class="flex flex-wrap items-center gap-2">
          <label class="btn-secondary btn-xs cursor-pointer">
            ${c(`upload`,`h-3.5 w-3.5`)} ${e?`Replace video`:`Upload video`}
            <input type="file" accept="video/*" class="sr-only" data-video-upload />
          </label>
          <button class="btn-ghost btn-xs" data-video-gallery>${c(`gallery`,`h-3.5 w-3.5`)} Gallery</button>
          ${e?`<span class="min-w-0 flex-1 truncate text-[11px] text-slate-500">${o(e.name||`Video selected`)}</span>`:``}
          ${e?`<button class="btn-ghost btn-xs text-rose-300 hover:bg-rose-500/10" data-video-clear>${c(`trash`,`h-3.5 w-3.5`)}</button>`:``}
        </div>
      </div>
    `}async function be(e,n){try{p(`Uploading image…`,`info`,1500);let t=await i(e);w.images[n]={upload:t.id,previewUrl:t.url,name:t.name},Y(),p(`Image ready.`,`success`,1600)}catch(e){p(t(e),`error`)}}async function xe(e,n,r){try{p(`Uploading ${r.toLowerCase()}…`,`info`,1500);let t=await i(e);n({upload:t.id,previewUrl:t.url,name:t.name}),Y(),p(`${r} ready.`,`success`,1600)}catch(e){p(t(e),`error`)}}function X(e){D({source:e,name:e.name||`audio`,title:`Trim reference audio`,subtitle:`Choose the part of the clip to keep before uploading. Trimmed selections are saved as WAV.`,onApply:e=>Q(e)})}function Z(){let e=w.audio;e?.previewUrl?D({source:e.previewUrl,name:e.name||`audio`,title:`Trim reference audio`,subtitle:`Choose the part of the clip to keep.`,onApply:e=>Q(e)}):p(`Choose an audio file first.`,`warning`)}async function Q(e){let t=await i(e);w.audio={upload:t.id,previewUrl:t.url,name:t.name||e.name},Y(),p(`Audio ready.`,`success`,1600)}async function Se(e){let n=m({title:`Choose an image`,subtitle:`Reuse a recent image from ComfyUI or the media folder.`,size:`lg`,content:`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">${Array.from({length:8}).map(()=>`<div class="skeleton aspect-square"></div>`).join(``)}</div>`});try{let t=await r(`/api/gallery/images?limit=60`);if(!t.items.length){n.body.innerHTML=y(`No images yet`,`Generate an image first, add one to the media folder, or upload one in the image editor.`,`image`);return}n.body.innerHTML=`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        ${t.items.map((e,t)=>`
            <button class="group overflow-hidden rounded-xl border border-subtle bg-raised text-left transition hover:border-accent-400/40 hover:bg-raised" data-gallery-item="${t}">
              <div class="aspect-square overflow-hidden bg-ink-950">
                <img src="${o(e.thumbnail_url||e.url)}" data-full-src="${o(e.url)}" alt="${o(e.filename)}" loading="lazy" class="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
              </div>
              <p class="truncate px-2.5 py-2 text-[11px] text-slate-400">${o(e.filename)}</p>
            </button>
          `).join(``)}
      </div>`,n.body.querySelectorAll(`[data-gallery-item]`).forEach(r=>{r.addEventListener(`click`,()=>{let i=t.items[Number(r.dataset.galleryItem)];w.images[e]={gallery:i,previewUrl:i.url,name:i.filename},n.close(),Y(),p(`Gallery image selected.`,`success`,1600)})}),n.body.querySelectorAll(`img[data-full-src]`).forEach(e=>{e.addEventListener(`error`,()=>{let t=e.dataset.fullSrc;t&&e.getAttribute(`src`)!==t?e.src=t:e.hidden=!0})})}catch(e){n.body.innerHTML=`<p class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">${o(t(e))}</p>`}}async function Ce(){let e=m({title:`Choose a video`,subtitle:`Reuse a recent video from ComfyUI or the media folder.`,size:`lg`,content:`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">${Array.from({length:8}).map(()=>`<div class="skeleton aspect-square"></div>`).join(``)}</div>`});try{let t=await r(`/api/gallery/videos?limit=60`);if(!t.items.length){e.body.innerHTML=y(`No videos yet`,`Generate or upscale a video first, add one to the media folder, or upload one above.`,`film`);return}e.body.innerHTML=`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        ${t.items.map((e,t)=>`
            <button class="group overflow-hidden rounded-xl border border-subtle bg-raised text-left transition hover:border-accent-400/40 hover:bg-raised" data-video-item="${t}">
              <div class="relative aspect-square overflow-hidden bg-ink-950">
                <span class="absolute inset-0 flex items-center justify-center text-slate-600">${c(`film`,`h-7 w-7`)}</span>
                ${e.thumbnail_url?`<img src="${o(e.thumbnail_url)}" data-thumbnail alt="${o(e.filename)}" loading="lazy" class="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105" />`:``}
                <span class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/25">
                  <span class="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white">
                    ${c(`play`,`h-5 w-5`)}
                  </span>
                </span>
              </div>
              <p class="truncate px-2.5 py-2 text-[11px] text-slate-400">${o(e.filename)}</p>
            </button>
          `).join(``)}
      </div>`,e.body.querySelectorAll(`[data-video-item]`).forEach(n=>{n.addEventListener(`click`,()=>{let r=t.items[Number(n.dataset.videoItem)];w.video={gallery:r,previewUrl:r.url,name:r.filename},e.close(),Y(),p(`Gallery video selected.`,`success`,1600)})}),e.body.querySelectorAll(`img[data-thumbnail]`).forEach(e=>{e.addEventListener(`error`,()=>e.remove())})}catch(n){e.body.innerHTML=`<p class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">${o(t(n))}</p>`}}async function we(){let e=m({title:`Choose audio`,subtitle:`Reuse a recent audio clip from ComfyUI or the media folder.`,size:`lg`,content:`<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">${Array.from({length:6}).map(()=>`<div class="skeleton h-32"></div>`).join(``)}</div>`});try{let t=await r(`/api/gallery/audio?limit=60`);if(!t.items.length){e.body.innerHTML=y(`No audio yet`,`Generate audio first, add a clip to the media folder, or upload one above.`,`music`);return}e.body.innerHTML=`<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        ${t.items.map((e,t)=>`
            <div class="rounded-xl border border-subtle bg-raised p-3">
              <div class="mb-2 flex items-center gap-2">
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">${c(`music`,`h-4 w-4`)}</span>
                <div class="min-w-0">
                  <p class="truncate text-xs font-semibold text-slate-200">${o(e.filename)}</p>
                  ${e.prompt?`<p class="truncate text-[11px] text-slate-500">${o(e.prompt)}</p>`:``}
                </div>
              </div>
              <audio class="mb-2 w-full" controls preload="none" src="${o(e.url)}"></audio>
              <button class="btn-secondary btn-xs w-full" data-audio-item="${t}">${c(`check`,`h-3.5 w-3.5`)} Use this audio</button>
            </div>
          `).join(``)}
      </div>`,e.body.querySelectorAll(`[data-audio-item]`).forEach(n=>{n.addEventListener(`click`,()=>{let r=t.items[Number(n.dataset.audioItem)];w.audio={gallery:r,previewUrl:r.url,name:r.filename},e.close(),Y(),p(`Gallery audio selected.`,`success`,1600)})})}catch(n){e.body.innerHTML=`<p class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">${o(t(n))}</p>`}}function Te(e){let n=w.images[e],r=m({title:`Sketch an input image`,subtitle:`Draw directly on the canvas. The result is uploaded when you apply it.`,size:`lg`,content:`
        <div class="space-y-3">
          <div class="flex flex-wrap items-center gap-3 rounded-xl border border-subtle bg-raised p-3">
            <label class="flex items-center gap-2 text-xs text-slate-400">
              Brush
              <input type="range" min="1" max="48" value="8" class="range w-28" data-brush-size />
              <span class="w-7 text-right font-mono text-slate-500" data-brush-label>8</span>
            </label>
            <label class="flex items-center gap-2 text-xs text-slate-400">
              Color
              <input type="color" value="#818cf8" class="h-8 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5" data-brush-color />
            </label>
            <button class="btn-ghost btn-xs ml-auto" data-sketch-clear>${c(`trash`,`h-4 w-4`)} Clear</button>
          </div>
          <div class="flex items-center justify-center overflow-hidden rounded-xl border border-subtle bg-ink-950 p-2">
            <canvas class="max-h-[62vh] max-w-full touch-none rounded-lg bg-white" data-sketch-canvas></canvas>
          </div>
        </div>
      `,footer:`
        <div class="flex w-full items-center justify-end gap-2">
          <button class="btn-secondary" data-sketch-cancel>Cancel</button>
          <button class="btn-primary" data-sketch-apply>${c(`check`,`h-4 w-4`)} Use sketch</button>
        </div>
      `}),a=v(r.element,`[data-sketch-canvas]`),o=a.getContext(`2d`);if(!o)throw Error(`Canvas 2D is not available.`);let s=v(r.element,`[data-brush-color]`),l=v(r.element,`[data-brush-size]`),u=v(r.element,`[data-brush-label]`),d=!1,f=null,h=s.value,_=Number(l.value),y=(e=1024,t=1024)=>{a.width=e,a.height=t,o.fillStyle=`#ffffff`,o.fillRect(0,0,e,t)},b=()=>{o.strokeStyle=h,o.lineWidth=_,o.lineCap=`round`,o.lineJoin=`round`};if(n?.previewUrl){let e=new Image;e.onload=()=>{let t=Math.min(1,1024/Math.max(e.naturalWidth,e.naturalHeight));y(Math.max(1,Math.round(e.naturalWidth*t)),Math.max(1,Math.round(e.naturalHeight*t))),o.drawImage(e,0,0,a.width,a.height),b()},e.onerror=()=>{y(),b()},e.src=n.previewUrl}else y(),b();let x=e=>{let t=a.getBoundingClientRect();return{x:(e.clientX-t.left)/t.width*a.width,y:(e.clientY-t.top)/t.height*a.height}};a.addEventListener(`pointerdown`,e=>{d=!0,a.setPointerCapture(e.pointerId),f=x(e),b(),o.beginPath(),o.arc(f.x,f.y,_/2,0,Math.PI*2),o.fillStyle=h,o.fill()}),a.addEventListener(`pointermove`,e=>{if(!d||!f)return;let t=x(e);b(),o.beginPath(),o.moveTo(f.x,f.y),o.lineTo(t.x,t.y),o.stroke(),f=t});let S=()=>{d=!1,f=null};a.addEventListener(`pointerup`,S),a.addEventListener(`pointercancel`,S),a.addEventListener(`pointerleave`,S),s.addEventListener(`input`,()=>{h=s.value}),l.addEventListener(`input`,()=>{_=Number(l.value),u.textContent=String(_)}),r.element.querySelector(`[data-sketch-clear]`)?.addEventListener(`click`,()=>{o.fillStyle=`#ffffff`,o.fillRect(0,0,a.width,a.height)}),r.element.querySelector(`[data-sketch-cancel]`)?.addEventListener(`click`,()=>r.close()),r.element.querySelector(`[data-sketch-apply]`)?.addEventListener(`click`,n=>{let o=n.currentTarget;g(o,!0,`Uploading…`),a.toBlob(async n=>{if(!n)g(o,!1),p(`Could not export the sketch.`,`error`);else try{let t=await i(new File([n],`sketch.png`,{type:`image/png`}));w.images[e]={upload:t.id,previewUrl:t.url,name:`sketch.png`},r.close(),Y(),p(`Sketch applied.`,`success`)}catch(e){p(t(e),`error`),g(o,!1)}},`image/png`)})}function Ee(e){let n=w.images[e];if(!n?.previewUrl){p(`Choose an image first.`,`warning`);return}let r=null,a=m({title:`Crop an input image`,subtitle:`Drag the box to move it, or its handles to resize. Dimensions are rounded to multiples of 8.`,size:`lg`,onClose:()=>{r&&window.removeEventListener(`resize`,r)},content:`
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-3 rounded-xl border border-subtle bg-raised px-3 py-2">
            <span class="min-w-0 truncate text-[11px] text-slate-500">Source: ${o(n.name||`image`)}</span>
            <span class="shrink-0 font-mono text-[11px] text-slate-400" data-crop-size>—</span>
          </div>
          <div class="flex items-center justify-center rounded-xl border border-subtle bg-ink-950 p-2">
            <div class="relative inline-block max-w-full touch-none select-none" data-crop-stage>
              <img src="${o(n.previewUrl)}" alt="Image to crop" draggable="false" class="block max-h-[62vh] max-w-full" data-crop-image />
              <div class="pointer-events-none absolute bg-black/60" data-shade="n"></div>
              <div class="pointer-events-none absolute bg-black/60" data-shade="s"></div>
              <div class="pointer-events-none absolute bg-black/60" data-shade="w"></div>
              <div class="pointer-events-none absolute bg-black/60" data-shade="e"></div>
              <div class="absolute border-2 border-white/90" data-crop-box>
                <span class="absolute inset-0 cursor-move" data-handle="move"></span>
                <span class="absolute left-0 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-sm border border-black/40 bg-white shadow" data-handle="nw"></span>
                <span class="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-sm border border-black/40 bg-white shadow" data-handle="n"></span>
                <span class="absolute left-full top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize rounded-sm border border-black/40 bg-white shadow" data-handle="ne"></span>
                <span class="absolute left-full top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-black/40 bg-white shadow" data-handle="e"></span>
                <span class="absolute left-full top-full h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-sm border border-black/40 bg-white shadow" data-handle="se"></span>
                <span class="absolute left-1/2 top-full h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-sm border border-black/40 bg-white shadow" data-handle="s"></span>
                <span class="absolute left-0 top-full h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize rounded-sm border border-black/40 bg-white shadow" data-handle="sw"></span>
                <span class="absolute left-0 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-black/40 bg-white shadow" data-handle="w"></span>
              </div>
            </div>
          </div>
          <p class="text-[11px] leading-5 text-slate-500">
            The cropped image replaces the selected one in this slot. Crop it again to adjust the result.
          </p>
        </div>
      `,footer:`
        <div class="flex w-full items-center justify-end gap-2">
          <button class="btn-secondary" data-crop-cancel>Cancel</button>
          <button class="btn-primary" data-crop-apply>${c(`check`,`h-4 w-4`)} Use crop</button>
        </div>
      `}),s=v(a.element,`[data-crop-image]`),l=v(a.element,`[data-crop-box]`),u=v(a.element,`[data-crop-size]`),d=v(a.element,`[data-crop-apply]`),f={n:v(a.element,`[data-shade="n"]`),s:v(a.element,`[data-shade="s"]`),w:v(a.element,`[data-shade="w"]`),e:v(a.element,`[data-shade="e"]`)},h=null,y=null,b=()=>{let e=s.getBoundingClientRect();return{width:e.width,height:e.height}},x=(e,t)=>({width:Math.min(.5,24/Math.max(1,e)),height:Math.min(.5,24/Math.max(1,t))});function S(){if(!h||!s.naturalWidth||!s.naturalHeight)return null;let e=s.naturalWidth,t=s.naturalHeight,n=_(Math.round(h.width*e/8)*8,8,e),r=_(Math.round(h.height*t/8)*8,8,t);return{x:_(Math.round(h.x*e),0,e-n),y:_(Math.round(h.y*t),0,t-r),width:n,height:r}}function C(){if(!h)return;let e=h.x*100,t=h.y*100,n=h.width*100,r=h.height*100;l.style.left=`${e}%`,l.style.top=`${t}%`,l.style.width=`${n}%`,l.style.height=`${r}%`,Object.assign(f.n.style,{left:`0%`,top:`0%`,width:`100%`,height:`${t}%`}),Object.assign(f.s.style,{left:`0%`,top:`${t+r}%`,width:`100%`,bottom:`0`}),Object.assign(f.w.style,{left:`0%`,top:`${t}%`,width:`${e}%`,height:`${r}%`}),Object.assign(f.e.style,{left:`${e+n}%`,top:`${t}%`,right:`0`,height:`${r}%`});let i=S();i&&u&&(u.textContent=`${i.width} × ${i.height}`)}function T(){let{width:e,height:t}=b();if(!e||!t)return;let n=Math.min(e,t)*.8;h={x:(e-n)/2/e,y:(t-n)/2/t,width:n/e,height:n/t},C()}function E(e,t,n,r){let{width:i,height:a}=b();if(!i||!a)return t;let o=x(i,a),s={...t},c=n/i,l=r/a;if(e===`move`)return s.x=_(t.x+c,0,1-t.width),s.y=_(t.y+l,0,1-t.height),s;let u=t.x,d=t.y,f=t.x+t.width,p=t.y+t.height;return e.includes(`w`)&&(u=_(u+c,0,Math.max(0,f-o.width))),e.includes(`e`)&&(f=_(f+c,Math.min(1,u+o.width),1)),e.includes(`n`)&&(d=_(d+l,0,Math.max(0,p-o.height))),e.includes(`s`)&&(p=_(p+l,Math.min(1,d+o.height),1)),s.x=u,s.y=d,s.width=f-u,s.height=p-d,s}l.querySelectorAll(`[data-handle]`).forEach(e=>{e.addEventListener(`pointerdown`,t=>{h&&(t.preventDefault(),t.stopPropagation(),e.setPointerCapture(t.pointerId),y={mode:e.dataset.handle||``,pointerId:t.pointerId,startX:t.clientX,startY:t.clientY,selection:{...h}})}),e.addEventListener(`pointermove`,e=>{y&&y.pointerId===e.pointerId&&(h=E(y.mode,y.selection,e.clientX-y.startX,e.clientY-y.startY),C())});let t=e=>{y&&y.pointerId===e.pointerId&&(y=null)};e.addEventListener(`pointerup`,t),e.addEventListener(`pointercancel`,t)}),r=()=>C(),window.addEventListener(`resize`,r);let D=()=>{requestAnimationFrame(T)};s.complete&&s.naturalWidth>0?D():s.addEventListener(`load`,D,{once:!0}),s.addEventListener(`error`,()=>{u.textContent=`Image unavailable`,d.disabled=!0}),a.element.querySelector(`[data-crop-cancel]`)?.addEventListener(`click`,()=>a.close());let O=/\.(jpe?g)$/i.test(n.name||``)?`image/jpeg`:`image/png`;d.addEventListener(`click`,()=>{let n=S();if(!n){p(`The image is still loading.`,`warning`);return}g(d,!0,`Cropping…`);let r=document.createElement(`canvas`);r.width=n.width,r.height=n.height;let o=r.getContext(`2d`);o?(o.drawImage(s,n.x,n.y,n.width,n.height,0,0,n.width,n.height),r.toBlob(async n=>{if(!n){g(d,!1),p(`Could not export the crop.`,`error`);return}let r=O===`image/jpeg`?`jpg`:`png`;try{let t=await i(new File([n],`crop.${r}`,{type:O}));w.images[e]={upload:t.id,previewUrl:t.url,name:t.name||`crop.${r}`},a.close(),Y(),p(`Crop applied.`,`success`)}catch(e){p(t(e),`error`),g(d,!1)}},O,O===`image/jpeg`?.92:void 0)):(g(d,!1),p(`Could not crop the image.`,`error`))})}function De(e,t){let n=e.field_def||{},r=n.widget||`textbox`,i=n.options||{},a=o(e.id),s=o(e.display_name||e.title||e.class_type),c=`<span class="font-mono text-[10px] text-slate-600">${o(e.node)} · ${o(e.input)}</span>`;if(r===`textbox`)return`
        <div class="field-row" data-control="${a}">
          <div class="flex items-center justify-between gap-2"><label class="label mb-0" for="field-${a}">${s}</label>${c}</div>
          <textarea id="field-${a}" class="textarea" rows="${Math.max(1,Math.min(Number(i.lines)||3,12))}" data-binding="${a}" placeholder="${o(i.placeholder||``)}">${o(t??``)}</textarea>
        </div>
      `;if(r===`slider`){let e=Number(i.minimum??0),n=Number(i.maximum??1),r=Number(i.step??.01)||.01,o=Number(t??e);return`
        <div class="field-row" data-control="${a}">
          <div class="flex items-center justify-between gap-2"><label class="label mb-0" for="field-${a}">${s}</label>${c}</div>
          <div class="flex items-center gap-3">
            <input id="field-${a}" type="range" class="range min-w-0 flex-1" min="${e}" max="${n}" step="${r}" value="${o}" data-binding="${a}" data-range />
            <input type="number" class="input w-24 shrink-0 text-right font-mono text-xs" min="${e}" max="${n}" step="${r}" value="${o}" data-range-number />
          </div>
        </div>
      `}if(r===`dropdown`){let e=Array.isArray(n.choices)?[...n.choices]:[];return t!=null&&!e.includes(t)&&e.unshift(t),`
        <div class="field-row" data-control="${a}">
          <div class="flex items-center justify-between gap-2"><label class="label mb-0" for="field-${a}">${s}</label>${c}</div>
          <select id="field-${a}" class="select" data-binding="${a}">
            ${e.map(e=>`<option value="${o(e)}" ${String(e)===String(t)?`selected`:``}>${o(e)}</option>`).join(``)}
          </select>
        </div>
      `}return r===`checkbox`?`
        <div class="field-row" data-control="${a}">
          <label class="flex items-center justify-between gap-3 rounded-xl border border-subtle bg-raised px-3 py-2.5">
            <span class="min-w-0"><span class="block text-sm font-medium text-slate-200">${s}</span><span class="mt-0.5 block font-mono text-[10px] text-slate-600">${o(e.node)} · ${o(e.input)}</span></span>
            <span class="switch"><input type="checkbox" data-binding="${a}" ${t?`checked`:``} /><span></span></span>
          </label>
        </div>
      `:`
      <div class="field-row" data-control="${a}">
        <div class="flex items-center justify-between gap-2"><label class="label mb-0" for="field-${a}">${s}</label>${c}</div>
        <input id="field-${a}" type="number" class="input font-mono text-xs" step="${Number(i.precision)===0?1:`any`}" value="${o(t??``)}" data-binding="${a}" />
      </div>
    `}function Oe(){if(!u)return;let e=u,t=new Map(e.candidates.map(e=>[e.id,e])),n=e.selected.map(e=>t.get(e)).filter(e=>!!e),r=e.candidates.some(e=>/(^|_)(noise_)?seed$/.test(e.input))?`<label class="flex items-center justify-between gap-3 rounded-xl border border-subtle bg-raised px-3 py-2.5">
           <span><span class="block text-sm font-medium text-slate-200">Randomize seed</span><span class="text-[11px] text-slate-500">Use a fresh seed on every run</span></span>
           <span class="switch"><input type="checkbox" ${b?`checked`:``} data-randomize /><span></span></span>
         </label>`:``,i=()=>{R.querySelector(`[data-randomize]`)?.addEventListener(`change`,e=>{b=e.target.checked})};if(T(`[data-controls-summary]`).textContent=`${n.length} control${n.length===1?``:`s`} shown`,!n.length)R.innerHTML=`
        ${y(`No inputs selected`,`Use Choose inputs to pick which workflow parameters appear here.`,`settings`)}
        <div class="mt-4 flex justify-center"><button class="btn-secondary btn-xs" data-empty-choose>Choose inputs</button></div>
        ${r?`<div class="mt-4">${r}</div>`:``}
      `,R.querySelector(`[data-empty-choose]`)?.addEventListener(`click`,ke),i();else{for(let e of n)e.id in w.values&&w.values[e.id]!==void 0||(w.values[e.id]=e.value);R.innerHTML=`
      <div class="space-y-4">
        ${n.map(e=>De(e,w.values[e.id])).join(``)}
      </div>
      ${r?`<div class="mt-4">${r}</div>`:``}
    `,R.querySelectorAll(`[data-binding]`).forEach(t=>{let n=t.dataset.binding;if(!n)return;let r=e.candidates.find(e=>e.id===n)?.field_def?.widget,i=()=>{if(t.type===`checkbox`)return t.checked;if(t.type===`number`||t.type===`range`){let e=Number(t.value);return Number.isFinite(e)?e:t.value}return t.value},a=()=>{if(w.values[n]=i(),t.dataset.range!==void 0){let e=t.closest(`[data-control]`)?.querySelector(`[data-range-number]`);e&&(e.value=t.value)}};if(t.addEventListener(`input`,a),t.addEventListener(`change`,a),r===`slider`&&t.dataset.range!==void 0){let e=t.closest(`[data-control]`)?.querySelector(`[data-range-number]`);e?.addEventListener(`input`,()=>{let r=Number(t.min),i=Number(t.max),a=Math.min(i,Math.max(r,Number(e.value)||r));t.value=String(a),w.values[n]=a})}}),i()}}function ke(){if(!u)return;let e=u,n=e.candidates.map(t=>{let n=e.selected.indexOf(t.id);return{candidate:t,show:n>=0,order:n>=0?String(n+1):``,name:t.display_name||``}});n.sort((e,t)=>e.show===t.show?e.show&&t.show?Number(e.order)-Number(t.order):0:e.show?-1:1);let i=m({title:`Choose inputs`,subtitle:`Pick which node inputs are shown for ${e.name}. Drag-free ordering is set with the Order column.`,size:`lg`,content:`
        <div class="space-y-5">
          <div class="flex flex-wrap items-center gap-2">
            <button class="btn-secondary btn-xs" data-select-all>Select all</button>
            <button class="btn-ghost btn-xs" data-select-none>Select none</button>
            <span class="ml-auto text-[11px] text-slate-500">${n.length} candidate input${n.length===1?``:`s`}</span>
          </div>
          <div class="overflow-x-auto rounded-xl border border-subtle">
            <table class="w-full min-w-[36rem] text-left text-sm">
              <thead class="border-b border-subtle bg-raised text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th class="w-14 px-3 py-2.5">Show</th>
                  <th class="w-20 px-3 py-2.5">Order</th>
                  <th class="px-3 py-2.5">Node input</th>
                  <th class="w-48 px-3 py-2.5">Display name</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/[0.05]">
                ${n.map((e,t)=>`
                  <tr class="align-middle ${e.show?`bg-accent-500/[0.035]`:``}" data-picker-row="${t}">
                    <td class="px-3 py-2"><input type="checkbox" class="h-4 w-4 rounded border-white/20 bg-ink-950 accent-accent-500" data-show ${e.show?`checked`:``} /></td>
                    <td class="px-3 py-2"><input type="number" min="1" class="input w-16 px-2 py-1 text-center font-mono text-xs" value="${e.order}" data-order ${e.show?``:`disabled`} /></td>
                    <td class="px-3 py-2">
                      <span class="block text-xs font-medium text-slate-200">${o(e.candidate.title)} · ${o(e.candidate.input)}</span>
                      <span class="mt-0.5 block font-mono text-[10px] text-slate-600">${o(e.candidate.label)}</span>
                    </td>
                    <td class="px-3 py-2"><input class="input px-2 py-1 text-xs" value="${o(e.name)}" placeholder="Optional" data-name /></td>
                  </tr>
                `).join(``)}
              </tbody>
            </table>
          </div>
        </div>
      `,footer:`
        <div class="flex w-full flex-wrap items-center justify-end gap-2">
          <button class="btn-secondary" data-picker-close>Close</button>
          <button class="btn-primary" data-picker-save>${c(`check`,`h-4 w-4`)} Save selection</button>
        </div>
      `}),a=[...i.body.querySelectorAll(`[data-picker-row]`)],s=e=>{let t=n[e],r=a[e];if(!t||!r)return;let i=v(r,`[data-show]`),o=v(r,`[data-order]`);if(t.show=i.checked,t.show&&!o.value){let e=n.filter(e=>e.show&&e.order).map(e=>Number(e.order));o.value=String(e.length?Math.max(...e)+1:1)}t.order=o.value,o.disabled=!t.show,r.classList.toggle(`bg-accent-500/[0.035]`,t.show)};a.forEach((e,t)=>{e.querySelector(`[data-show]`)?.addEventListener(`change`,()=>s(t)),e.querySelector(`[data-order]`)?.addEventListener(`input`,e=>{let r=n[t];r&&(r.order=e.target.value)}),e.querySelector(`[data-name]`)?.addEventListener(`input`,e=>{let r=n[t];r&&(r.name=e.target.value)})}),i.body.querySelector(`[data-select-all]`)?.addEventListener(`click`,()=>{n.forEach((e,t)=>{if(!e.show){let e=a[t];if(!e)return;v(e,`[data-show]`).checked=!0,s(t)}})}),i.body.querySelector(`[data-select-none]`)?.addEventListener(`click`,()=>{n.forEach((e,t)=>{let n=a[t];n&&(v(n,`[data-show]`).checked=!1,s(t))})}),i.element.querySelector(`[data-picker-close]`)?.addEventListener(`click`,()=>i.close()),i.element.querySelector(`[data-picker-save]`)?.addEventListener(`click`,async a=>{let o=a.currentTarget;g(o,!0,`Saving…`);let s=n.filter(e=>e.show).sort((e,t)=>(e.order===``?1/0:Number(e.order))-(t.order===``?1/0:Number(t.order)));try{let t=await r(`${k(e.name)}/fields`,{method:`PUT`,body:{bindings:[...s.map(e=>({id:e.candidate.id,name:e.name.trim(),visible:!0})),...n.filter(e=>!e.show&&e.name.trim()).map(e=>({id:e.candidate.id,name:e.name.trim(),visible:!1}))]}});i.close(),$(t,{preserve:!0}),p(`Input selection saved.`,`success`)}catch(e){p(t(e),`error`),g(o,!1)}})}function Ae(){if(!u)return;let e=u,n=m({title:`Workflow notes`,subtitle:`Markdown tips shown on the Generate page for ${e.name}.`,size:`lg`,content:`
        <textarea class="textarea font-mono text-xs" rows="14" data-notes placeholder="### Tips&#10;&#10;- Add workflow-specific tips here.">${o(e.notes||``)}</textarea>
      `,footer:`
        <div class="flex w-full flex-wrap items-center justify-end gap-2">
          <button class="btn-secondary" data-notes-cancel>Cancel</button>
          <button class="btn-primary" data-notes-save>${c(`check`,`h-4 w-4`)} Save notes</button>
        </div>
      `});n.element.querySelector(`[data-notes-cancel]`)?.addEventListener(`click`,()=>n.close()),n.element.querySelector(`[data-notes-save]`)?.addEventListener(`click`,async i=>{let a=i.currentTarget,o=v(n.body,`[data-notes]`).value;g(a,!0,`Saving…`);try{let t=await r(`${k(e.name)}/notes`,{method:`PUT`,body:{notes:o}});e.notes=t.notes,he(),n.close(),p(`Notes saved.`,`success`)}catch(e){p(t(e),`error`),g(a,!1)}})}function $(e,{preserve:t=!1}={}){let n=w.values;u=e,f=e.name,E&&(E.value=f),t?(w.values={...e.values,...n},w.images=e.image_nodes.map((e,t)=>w.images[t]||null)):(w.values={...e.values},w.images=e.image_nodes.map(()=>null),w.audio=null,w.video=null,w.result=null,w.error=``,w.elapsedMs=0,N.running||ce()),me(),ge(),he(),Y(),Oe(),J(),fe=``,je()}function je(){E&&(E.disabled=w.running),H.disabled=w.running||!u,H.innerHTML=w.running?`${l(`h-4 w-4`)} Generating…`:`${c(`play`,`h-4 w-4`)} Generate`,W.disabled=!w.running}async function Me(e,{preserve:n=!1}={}){if(!e)T(`[data-workflow-summary]`).textContent=`No workflow selected`;else try{T(`[data-workflow-summary]`).textContent=`Loading…`;let t=await r(k(e));$(t,{preserve:n}),n||(x=t.default_preset||t.preset_names[0]||``)}catch(e){p(t(e),`error`),T(`[data-workflow-summary]`).textContent=`Could not load workflow`}}async function Ne(){u&&!N.running&&await ne({workflow:u.name,values:A(u,w.values),randomize_seed:b,images:u.image_nodes.map((e,t)=>M(w.images[t])),audio:M(w.audio),video:M(w.video)})}async function Pe(){if(N.running){N.progress={value:N.progress?.value??0,message:`Cancelling…`,indeterminate:!0},z();try{await r(`/api/generate/cancel`,{method:`POST`}),p(`Stopping generation…`,`warning`,2200),U(250)}catch(e){p(t(e),`error`)}}}return E?.addEventListener(`change`,()=>{x=null,Me(E.value,{preserve:!1})}),T(`[data-reload-workflow]`)?.addEventListener(`click`,()=>{Me(f,{preserve:!0}),p(`Workflow refreshed.`,`success`,1800)}),T(`[data-choose-inputs]`)?.addEventListener(`click`,ke),H.addEventListener(`click`,()=>{Ne()}),W.addEventListener(`click`,()=>{Pe()}),je(),J(),f&&await Me(f),w.unsubscribe=B(pe),()=>{w.unsubscribe?.(),w.unsubscribe=null,w.timer&&=(clearInterval(w.timer),null)}}var re=`opensail.chat.settings.v1`,ie=typeof window<`u`?window.SpeechRecognition||window.webkitSpeechRecognition:null,ae=!!ie&&typeof window<`u`&&window.isSecureContext,K=`/assets/pages/chat.html`,oe=null;function se(){return oe||=fetch(K).then(e=>{if(!e.ok)throw Error(`Could not load the chat layout (${e.status}).`);return e.text()}).catch(e=>{throw oe=null,e}),oe}function ce(e){let t={};try{t=JSON.parse(localStorage.getItem(re)||`{}`)}catch{t={}}return{model:t.model||e.default_chat_model||``,systemPrompt:t.systemPrompt??e.chat_system_prompt??``,thinking:t.thinking??!1,engine:t.engine||`off`,browserVoice:t.browserVoice||``,ttsVoice:t.ttsVoice||``,persona:t.persona||``}}function q(e){try{localStorage.setItem(re,JSON.stringify(e))}catch{}}async function le(e,n){if(!n.boot)throw Error(`Chat page requires the bootstrap payload.`);let s=n.boot,u=ce(s),_=[],y=[],b=!1,x=null,S=[],C=``,w=s.chat_loaded?s.chat_status:`No model loaded. It loads on the first message.`,T=``,E=null,D=`idle`,O=``,k=``,A=!1,j=!1,M=!1,N=!1,P=!1,F=s.chat_models||[],I=F.map(e=>`<option value="${o(e.path)}" ${e.path===u.model?`selected`:``}>${o(e.alias)}</option>`).join(``),L=s.tts_models||[],R=new Set(L.map(e=>e.id));function z(e){return R.has(e)}function B(){return L.find(e=>e.id===u.engine)||null}e.innerHTML=await se(),e.querySelectorAll(`[data-icon]`).forEach(e=>{e.innerHTML=c(e.dataset.icon||`info`,e.dataset.iconClass||`h-4 w-4`)});let V=t=>v(e,t),H=V(`[data-messages]`),U=V(`[data-input]`),W=V(`[data-composer]`),ee=V(`[data-send]`),te=V(`[data-stop]`),ne=V(`[data-model]`),G=V(`[data-attach]`),re=V(`[data-file]`),K=V(`[data-talk]`),oe=V(`[data-talk-label]`),le=V(`[data-attachments]`),ue=V(`[data-chat-status]`),de=V(`[data-chat-phase]`),fe=V(`[data-model-chip]`),pe=V(`[data-spoken]`),J=V(`[data-spoken-wrap]`),me=V(`[data-system]`),he=V(`[data-thinking]`),ge=V(`[data-engine]`),Y=V(`[data-browser-voice]`),_e=V(`[data-browser-voice-wrap]`),ve=V(`[data-tts-voice]`),ye=V(`[data-tts-voice-wrap]`),be=V(`[data-persona]`),xe=V(`[data-persona-save]`),X=V(`[data-persona-delete]`),Z=s.chat_personas||{},Q=``,Se=``;ie&&(K.classList.remove(`hidden`),ae||(K.classList.add(`cursor-not-allowed`,`opacity-40`),K.title=`Voice input requires HTTPS or localhost.`,K.setAttribute(`aria-label`,K.title))),ne.innerHTML=I||`<option value="">No models configured</option>`,me.value=u.systemPrompt,he.checked=u.thinking;for(let e of L){let t=document.createElement(`option`);t.value=e.id,t.textContent=e.alias,ge.append(t)}[...ge.options].map(e=>e.value).includes(u.engine)&&(ge.value=u.engine),u.engine=ge.value,q(u);function Ce(){return`
      <div class="flex h-full min-h-[24rem] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent-400/20 bg-accent-500/10 text-accent-300">${c(`chat`,`h-7 w-7`)}</div>
        <div>
          <p class="text-sm font-semibold text-slate-200">Start a conversation</p>
          <p class="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">Replies stream from a local GGUF model. Attach an image if the selected model has a vision projector configured.</p>
        </div>
        <div class="flex flex-wrap justify-center gap-2">
          ${[`Summarize this image`,`Help me write a prompt`,`Explain a ComfyUI node`].map(e=>`<button class="chip transition hover:border-accent-400/30 hover:text-accent-200" data-suggestion="${o(e)}">${o(e)}</button>`).join(``)}
        </div>
      </div>
    `}function we(){_.length?(H.innerHTML=_.map((e,t)=>e.role===`user`?`
            <div class="flex justify-end gap-2.5 px-4 py-2 sm:px-5" data-message="${t}">
              <div class="min-w-0 max-w-[88%]">
                <div class="chat-bubble-user">${f(e.content)}</div>
                ${e.images?.length?`<div class="mt-2 flex flex-wrap justify-end gap-2">${e.images.map(e=>`<a href="${o(e.url)}" target="_blank" rel="noopener noreferrer" class="block h-20 w-20 overflow-hidden rounded-xl border border-white/10"><img src="${o(e.url)}" alt="Attached image" class="h-full w-full object-cover" /></a>`).join(``)}</div>`:``}
              </div>
              <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[11px] font-semibold text-slate-400">You</span>
            </div>
          `:`
          <div class="flex gap-2.5 px-4 py-2 sm:px-5" data-message="${t}">
            <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-accent-300">${c(`sparkles`,`h-4 w-4`)}</span>
            <div class="chat-bubble-assistant min-w-0">
              <div class="prose-notes" data-bubble>${d(e.content)||`<span class="text-slate-500">${e.stopped?`Stopped.`:`Thinking…`}</span>`}</div>
              ${e.streaming?`<span class="mt-1 inline-block h-3.5 w-1 animate-pulse rounded-full bg-accent-400 align-middle"></span>`:``}
            </div>
          </div>
        `).join(``),Ee(!0)):(H.innerHTML=Ce(),H.querySelectorAll(`[data-suggestion]`).forEach(e=>{e.addEventListener(`click`,()=>{U.value=e.dataset.suggestion||``,U.focus()})}))}function Te(e){let t=_.indexOf(e),n=H.querySelector(`[data-message="${t}"] [data-bubble]`);if(!n){we();return}n.innerHTML=d(e.content)||`<span class="text-slate-500">${e.stopped?`Stopped.`:`Thinking…`}</span>`;let r=n.parentElement?.querySelector(`.animate-pulse`);e.streaming||r?.remove(),Ee()}function Ee(e=!1){let t=H.scrollHeight-H.scrollTop-H.clientHeight;(e||t<180)&&(H.scrollTop=H.scrollHeight)}function De(){le.classList.toggle(`hidden`,!y.length),le.innerHTML=y.map((e,t)=>`
        <div class="relative h-16 w-16 overflow-hidden rounded-lg border border-white/10">
          <img src="${o(e.url)}" alt="${o(e.name||`Attachment`)}" class="h-full w-full object-cover" />
          <button type="button" class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-rose-500" data-remove-attachment="${t}" aria-label="Remove attachment">${c(`close`,`h-3 w-3`)}</button>
        </div>
      `).join(``),le.querySelectorAll(`[data-remove-attachment]`).forEach(e=>{e.addEventListener(`click`,()=>{y.splice(Number(e.dataset.removeAttachment),1),De()})})}function Oe(){let e=!!F.find(e=>e.path===ne.value)?.multimodal;G.classList.toggle(`cursor-pointer`,e),G.classList.toggle(`cursor-not-allowed`,!e),G.classList.toggle(`opacity-40`,!e),G.setAttribute(`aria-disabled`,String(!e)),G.title=e?`Attach an image`:`This model does not support images`,re.disabled=!e,!e&&y.length&&(y=[],De())}re.addEventListener(`change`,async e=>{let n=e.target,r=[...n.files||[]];n.value=``;for(let e of r)try{let t=await i(e);y.push({id:t.id,url:t.url,name:t.name}),De()}catch(e){p(t(e),`error`)}});function ke(e){D=e;let t=e===`starting`||e===`listening`;K.classList.toggle(`btn-secondary`,!t),K.classList.toggle(`btn-danger`,t),K.setAttribute(`aria-pressed`,String(t));let n=ae?e===`finishing`?`Transcribing…`:t?`Release to Send`:`Hold to Talk`:`Voice input requires HTTPS or localhost.`;oe.textContent=n,K.title=n,K.setAttribute(`aria-label`,n),K.disabled=e===`finishing`||b||!F.length||!ae,Je(t?`Listening…`:e===`finishing`?`Transcribing…`:``)}function Ae(){if(P||N)return;let e=`${O} ${k}`.replace(/\s+/g,` `).trim(),t=M;if(E=null,O=``,k=``,A=!1,j=!1,M=!1,ke(`idle`),!e){t||p(`No speech was detected.`,`warning`,2200);return}let n=U.value.trim();U.value=n?`${n} ${e}`:e,Ye()}function $(){if(j=!0,D!==`idle`&&D!==`finishing`&&D!==`starting`){ke(`finishing`);try{E?.stop()}catch{Ae()}}}function je(){if(!ae||!ie||b||!F.length||D!==`idle`)return;N=!1,M=!1,j=!1,O=``,k=``,`speechSynthesis`in window&&window.speechSynthesis.cancel(),pe.pause();let e=new ie;E=e,e.lang=navigator.language||`en-US`,e.continuous=!0,e.interimResults=!0,e.maxAlternatives=1,e.onstart=()=>{P||N||(D===`starting`&&ke(`listening`),j&&$())},e.onresult=e=>{let t=``;for(let n=e.resultIndex;n<e.results.length;n+=1){let r=e.results[n],i=r[0]?.transcript||``;r.isFinal?O+=i:t+=i}k=t},e.onerror=e=>{e.error===`aborted`||P||N||(M=!0,p({"not-allowed":`Microphone access was denied.`,"audio-capture":`No microphone was found.`,"no-speech":`No speech was detected.`,network:`Speech recognition needs a network connection.`}[e.error]||`Speech recognition failed: ${e.error}`,e.error===`no-speech`?`warning`:`error`))},e.onend=()=>{if(!(P||N)){if(!j&&A&&!M){O+=k,k=``;try{e.start();return}catch{}}Ae()}},ke(`starting`);try{e.start()}catch(e){E=null,A=!1,p(t(e)||`Could not start speech recognition.`,`error`),ke(`idle`)}}function Me(){N=!0,j=!0,A=!1,O=``,k=``;let e=E;if(E=null,e)try{e.abort()}catch{}ke(`idle`)}K.addEventListener(`pointerdown`,e=>{if((e.pointerType!==`mouse`||e.button===0)&&!(b||D!==`idle`)){e.preventDefault(),A=!0;try{K.setPointerCapture(e.pointerId)}catch{}je()}});function Ne(e){if(A){A=!1;try{K.hasPointerCapture(e.pointerId)&&K.releasePointerCapture(e.pointerId)}catch{}$()}}K.addEventListener(`pointerup`,Ne),K.addEventListener(`pointercancel`,Ne),K.addEventListener(`lostpointercapture`,()=>{A&&(A=!1,$())}),K.addEventListener(`contextmenu`,e=>e.preventDefault()),K.addEventListener(`keydown`,e=>{e.key!==` `&&e.key!==`Enter`||e.repeat||b||D!==`idle`||(e.preventDefault(),A=!0,je())}),K.addEventListener(`keyup`,e=>{(e.key===` `||e.key===`Enter`)&&(e.preventDefault(),A&&(A=!1,$()))}),K.addEventListener(`blur`,()=>{A&&(A=!1,$())});function Pe(){if(!(`speechSynthesis`in window))return;let e=window.speechSynthesis.getVoices();Y.innerHTML=`<option value="">System default</option>`+e.map(e=>`<option value="${o(e.name)}" ${e.name===u.browserVoice?`selected`:``}>${o(e.name)}${e.lang?` (${o(e.lang)})`:``}</option>`).join(``)}function Fe(e){if(u.engine!==`browser`||!e.trim()||!(`speechSynthesis`in window))return;window.speechSynthesis.cancel();let t=new SpeechSynthesisUtterance(e),n=window.speechSynthesis.getVoices().find(e=>e.name===u.browserVoice);n&&(t.voice=n),window.speechSynthesis.speak(t)}function Ie(){let e=u.engine,t=z(e);_e.classList.toggle(`hidden`,e!==`browser`),ye.classList.toggle(`hidden`,!t),J.classList.toggle(`hidden`,!t||!pe.src)}async function Le(){let n=B();if(!n)return;let i=e.querySelector(`[data-refresh-voices]`);g(i,!0,`Loading…`);try{let e=await r(`/api/audio/voices?model_id=${encodeURIComponent(n.id)}`);if(u.engine!==n.id)return;if(S=e.voices||[],C=n.id,!S.length){ve.innerHTML=`<option value="">No voices reported</option>`,p(`No ${n.alias} voices were reported.`,`warning`);return}S.includes(u.ttsVoice)||(u.ttsVoice=S[0],q(u)),ve.innerHTML=S.map(e=>`<option value="${o(e)}" ${e===u.ttsVoice?`selected`:``}>${o(e)}</option>`).join(``),p(`Loaded ${S.length} voice${S.length===1?``:`s`}.`,`success`)}catch(e){p(t(e),`error`)}finally{g(i,!1)}}`speechSynthesis`in window&&(Pe(),window.speechSynthesis.onvoiceschanged=Pe);function Re(e){return e===`browser`?u.browserVoice:z(e)?u.ttsVoice:``}function ze(){return{system_prompt:u.systemPrompt,voice_engine:u.engine,voice:Re(u.engine)}}function Be(e){if(!e)return!1;let t=e.voice_engine||`off`;return(e.system_prompt||``)===u.systemPrompt&&t===u.engine&&(e.voice||``)===Re(t)}function Ve(){let e=!!Q;X.disabled=!e,X.classList.toggle(`opacity-40`,!e),X.classList.toggle(`cursor-not-allowed`,!e)}function He(){let e=Object.keys(Z);Q&&!Z[Q]&&(Q=``),be.innerHTML=`<option value="">Custom (unsaved)</option>`+e.map(e=>`<option value="${o(e)}" ${e===Q?`selected`:``}>${o(e)}</option>`).join(``),be.value=Q,Ve()}function Ue(){Q&&(Q=``,u.persona=``,He())}async function We(e){u.systemPrompt=e.system_prompt||``,u.engine=e.voice_engine||`off`,me.value=u.systemPrompt,[...ge.options].map(e=>e.value).includes(u.engine)||(u.engine=`off`),ge.value=u.engine,u.engine===`browser`?(u.browserVoice=e.voice||``,Y.value=u.browserVoice):z(u.engine)&&(u.ttsVoice=e.voice||``),Ie(),q(u),z(u.engine)&&(C!==u.engine&&await Le(),ve.value=u.ttsVoice)}function Ge(){let e=document.createElement(`div`);e.className=`space-y-3`,e.innerHTML=`
      <div>
        <label class="label" for="chat-persona-name">Name</label>
        <input id="chat-persona-name" class="input" maxlength="80" placeholder="e.g. Writing coach" value="${o(Q||Se)}" />
      </div>
      <p class="text-[11px] leading-5 text-slate-500">Saves the current system prompt, speech engine and voice. Using an existing name updates that persona.</p>
    `;let n=document.createElement(`div`);n.className=`flex items-center justify-end gap-2`,n.innerHTML=`
      <button class="btn-secondary" data-cancel>Cancel</button>
      <button class="btn-primary" data-confirm>${c(`save`,`h-4 w-4`)}<span>Save persona</span></button>
    `;let i=m({title:`Save persona`,subtitle:`Personas are stored on the server.`,content:e,footer:n}),a=v(e,`#chat-persona-name`),l=v(n,`[data-confirm]`),d=v(n,`[data-cancel]`),f=async()=>{let e=a.value.trim();if(!e)p(`Type a persona name first.`,`warning`),a.focus();else if(!Z[e]||e===Q||e===Se||await h(`A persona called “${e}” already exists. Overwrite it?`,{title:`Overwrite persona`,confirmLabel:`Overwrite`,danger:!0})){g(l,!0,`Saving…`);try{Z=(await r(`/api/chat/personas`,{method:`POST`,body:{name:e,...ze()}})).personas||{},s.chat_personas=Z,Q=e,Se=e,u.persona=e,q(u),He(),i.close(),p(`Saved persona “${e}”.`,`success`)}catch(e){p(t(e),`error`),g(l,!1)}}};d.addEventListener(`click`,()=>i.close()),l.addEventListener(`click`,()=>{f()}),a.addEventListener(`keydown`,e=>{e.key===`Enter`&&(e.preventDefault(),f())})}be.addEventListener(`change`,async()=>{let e=be.value;Q=e,Se=e,u.persona=e;try{e&&Z[e]?await We(Z[e]):q(u)}catch(e){p(t(e),`error`)}He()}),xe.addEventListener(`click`,Ge),X.addEventListener(`click`,async()=>{let e=Q;if(e&&await h(`Delete the persona “${e}”?`,{title:`Delete persona`,confirmLabel:`Delete`,danger:!0})){g(X,!0,`Deleting…`);try{Z=(await r(`/api/chat/personas/delete`,{method:`POST`,body:{name:e}})).personas||{},s.chat_personas=Z,Q=``,Se=``,u.persona=``,q(u),He(),p(`Persona deleted.`,`success`)}catch(e){p(t(e),`error`)}finally{g(X,!1),Ve()}}}),me.addEventListener(`input`,()=>{u.systemPrompt=me.value,Ue(),q(u)}),he.addEventListener(`change`,()=>{u.thinking=he.checked,q(u)}),ge.addEventListener(`change`,()=>{u.engine=ge.value,Ue(),q(u),Ie(),z(u.engine)&&C!==u.engine&&Le()}),Y.addEventListener(`change`,()=>{u.browserVoice=Y.value,Ue(),q(u)}),ve.addEventListener(`change`,()=>{u.ttsVoice=ve.value,Ue(),q(u)}),e.querySelector(`[data-refresh-voices]`)?.addEventListener(`click`,()=>{Le()}),Ie(),He(),u.persona&&Z[u.persona]&&Be(Z[u.persona])?(Q=u.persona,Se=Q,He()):u.persona&&(u.persona=``,q(u));function Ke(e,t){w=e,ue.textContent=e,fe.textContent=t?`Loaded`:`Idle`,fe.className=`chip ${t?`chip-success`:``}`}e.querySelector(`[data-load]`)?.addEventListener(`click`,async e=>{let i=e.currentTarget;g(i,!0,`Loading…`);try{let e=await r(`/api/chat/load`,{method:`POST`,body:{path:ne.value}});Ke(e.status||``,!!e.loaded),n.refreshStatus(),p(`Chat model loaded.`,`success`)}catch(e){p(t(e),`error`)}finally{g(i,!1)}}),e.querySelector(`[data-unload]`)?.addEventListener(`click`,async e=>{let i=e.currentTarget;g(i,!0,`Unloading…`);try{let e=await r(`/api/chat/unload`,{method:`POST`});Ke(e.status||``,!!e.loaded),n.refreshStatus(),p(`Chat model unloaded.`,`success`)}catch(e){p(t(e),`error`)}finally{g(i,!1)}}),ne.addEventListener(`change`,()=>{u.model=ne.value,q(u),Oe()});function qe(e){b=e,ee.disabled=e,ee.innerHTML=e?`${l(`h-3.5 w-3.5`)} Sending…`:`${c(`send`,`h-4 w-4`)} Send`,te.disabled=!e,K.disabled=e||!ae||!F.length||D===`finishing`}function Je(e){T=e||``,de.textContent=T,de.classList.toggle(`hidden`,!T),de.className=`chip ${T?`chip-warn`:``} hidden sm:inline-flex`}async function Ye(){if(b||D!==`idle`)return;let e=U.value.trim();if(!e&&!y.length)return;let r={role:`user`,content:e,images:y};_.push(r),y=[],De(),U.value=``,U.style.height=`auto`;let i={role:`assistant`,content:``,streaming:!0};_.push(i),we(),qe(!0),Je(`Preparing…`),x=new AbortController;let o=_.filter(e=>!e.streaming).map(e=>({role:e.role,content:e.content,images:(e.images||[]).map(e=>e.id)})),s=!1;try{await a(`/api/chat/stream`,{messages:o,system_prompt:u.systemPrompt,enable_thinking:u.thinking,speak_engine:u.engine,voice:z(u.engine)&&u.ttsVoice||null,model_path:u.model||null},e=>{e.type===`phase`?Je(e.message):e.type===`model`?(Ke(e.status||``,!!e.loaded),n.refreshStatus()):e.type===`chunk`?(i.content=e.text||``,Te(i)):e.type===`audio`?(pe.src=e.url||``,J.classList.remove(`hidden`),pe.play().catch(()=>{})):e.type===`warning`?p(e.message,`warning`):e.type===`error`?(i.content=i.content?`${i.content}\n\n**Error:** ${e.message}`:`**Error:** ${e.message}`,p(e.message,`error`)):e.type===`done`&&(i.streaming=!1)},x.signal)}catch(e){if(e.name===`AbortError`)s=!0;else{let n=t(e);i.content=i.content?`${i.content}\n\n**Error:** ${n}`:`**Error:** ${n}`,p(n,`error`)}}finally{s&&!i.content&&(i.stopped=!0),i.streaming=!1,we(),qe(!1),Je(``),x=null,!s&&u.engine===`browser`&&i.content&&Fe(i.content)}}async function Xe(){if(!b)return;te.disabled=!0;let e=!1,n=r(`/api/chat/cancel`,{method:`POST`}).catch(n=>{e=!0,p(t(n),`error`)});x?.abort(),Je(`Stopping…`),await n,e||p(`Stopped the reply.`,`warning`,1800)}return W.addEventListener(`submit`,e=>{e.preventDefault(),Ye()}),U.addEventListener(`keydown`,e=>{e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),Ye())}),U.addEventListener(`input`,()=>{U.style.height=`auto`,U.style.height=`${Math.min(U.scrollHeight,192)}px`}),te.addEventListener(`click`,()=>{Xe()}),e.querySelector(`[data-new-chat]`)?.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),D!==`idle`&&Me(),b&&(x?.abort(),r(`/api/chat/cancel`,{method:`POST`}).catch(()=>{})),_.length=0,y=[],De(),we(),Je(``)}),we(),qe(!1),Ke(w,s.chat_loaded),Oe(),()=>{if(P=!0,E){try{E.abort()}catch{}E=null}b&&(x?.abort(),r(`/api/chat/cancel`,{method:`POST`}).catch(()=>{})),`speechSynthesis`in window&&window.speechSynthesis.cancel()}}async function ue(e,n){let s=n.boot;if(!s)throw Error(`TTS page requires the bootstrap payload.`);let u=s.audio_models||[],d=s.default_audio_model||u[0]?.id||``,f=[],m=[],_=null,b=``,x=``,S=!1,C=null,w=null,T=s.audio_status||`audio.cpp server not running.`;e.innerHTML=`
    <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div class="min-w-0 space-y-5">
        <section class="card">
          <div class="card-header">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-fuchsia-500/10 text-fuchsia-300">${c(`mic`,`h-4 w-4`)}</span>
              <div>
                <h2 class="card-title">Speech</h2>
                <p class="card-subtitle">Generated by a local audio.cpp server</p>
              </div>
            </div>
            <span class="chip ${s.audio_loaded?`chip-success`:``}" data-model-chip>${s.audio_loaded?`Running`:`Idle`}</span>
          </div>
          <div class="space-y-4 p-4 sm:p-5">
            ${u.length?`<div class="flex flex-col gap-2 sm:flex-row">
                    <select class="select min-w-0 flex-1" data-model aria-label="Text to speech model">
                      ${u.map(e=>`<option value="${o(e.id)}" ${e.id===d?`selected`:``}>${o(e.alias)}</option>`).join(``)}
                    </select>
                    <div class="flex shrink-0 gap-2">
                      <button class="btn-secondary btn-xs" data-load>${c(`play`,`h-3.5 w-3.5`)} Load</button>
                      <button class="btn-ghost btn-xs" data-unload>${c(`stop`,`h-3.5 w-3.5`)} Unload</button>
                    </div>
                  </div>`:`<div class="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">No audio.cpp models configured. Add entries to <code class="font-mono">configs/audio_models.json</code>.</div>`}
            <p class="rounded-lg border border-subtle bg-raised px-3 py-2 text-[11px] leading-5 text-slate-500" data-status>${o(T)}</p>
            <div>
              <label class="label" for="tts-text">Text</label>
              <textarea id="tts-text" class="textarea min-h-[9rem]" rows="6" data-text placeholder="Type the text to speak…"></textarea>
            </div>
            <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_15rem]">
              <div>
                <label class="label" for="tts-voice">Voice</label>
                <select id="tts-voice" class="select" data-voice aria-label="Voice"></select>
                <p class="mt-1 text-[11px] text-slate-500">Load the model or refresh to list its voices.</p>
              </div>
              <div>
                <div class="flex items-center justify-between gap-2"><label class="label" for="tts-speed">Speed</label><span class="text-[11px] font-mono text-slate-500" data-speed-label>1.00×</span></div>
                <div class="flex items-center gap-2">
                  <input id="tts-speed" type="range" class="range min-w-0 flex-1" min="0.5" max="2" step="0.05" value="1" data-speed />
                  <input type="number" class="input w-20 shrink-0 text-right font-mono text-xs" min="0.5" max="2" step="0.05" value="1" data-speed-number />
                </div>
                <p class="mt-1 text-[11px] text-slate-500">Some models only accept 1.0.</p>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button class="btn-secondary btn-xs" data-refresh-voices>${c(`refresh`,`h-4 w-4`)} Refresh voices</button>
              <span class="text-[11px] text-slate-500" data-voice-status>Voices are listed from the running server.</span>
            </div>
          </div>
        </section>

        <section class="card">
          <details class="group">
            <summary class="card-header cursor-pointer list-none select-none">
              <div class="flex items-center gap-2.5">
                <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300">${c(`wand`,`h-4 w-4`)}</span>
                <div>
                  <h2 class="card-title">Voice cloning & advanced</h2>
                  <p class="card-subtitle">Optional reference clip and sampler controls</p>
                </div>
              </div>
              <span class="text-slate-500 transition group-open:rotate-180">${c(`chevron`,`h-4 w-4`)}</span>
            </summary>
            <div class="space-y-4 border-t border-subtle p-4 sm:p-5">
              <div class="rounded-xl border border-subtle bg-raised p-3" data-ref-panel></div>
              <div class="rounded-xl border border-subtle bg-raised p-3" data-saved-voices-panel></div>
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="label" for="tts-seed">Seed</label>
                  <input id="tts-seed" type="number" class="input font-mono text-xs" value="0" step="1" data-seed />
                </div>
                <div>
                  <label class="label" for="tts-max-tokens">Max tokens</label>
                  <input id="tts-max-tokens" type="number" class="input font-mono text-xs" value="0" step="1" data-max-tokens />
                  <p class="mt-1 text-[11px] text-slate-500">0 uses the model default.</p>
                </div>
              </div>
            </div>
          </details>
        </section>

        <section class="card">
          <div class="space-y-3 p-4 sm:p-5">
            <div class="flex flex-wrap gap-2">
              <button class="btn-primary min-w-[9rem] flex-1" data-generate ${u.length?``:`disabled`}>${c(`play`,`h-4 w-4`)} Generate speech</button>
              <button class="btn-danger min-w-[7rem] flex-1" data-stop disabled>${c(`stop`,`h-4 w-4`)} Stop</button>
            </div>
            <div class="hidden items-center gap-2 text-xs text-slate-400" data-phase-wrap>
              ${l(`h-3.5 w-3.5`)}
              <span data-phase>Generating…</span>
            </div>
          </div>
        </section>
      </div>

      <aside class="min-w-0 space-y-5 xl:sticky xl:top-24 xl:self-start">
        <section class="card overflow-hidden">
          <div class="card-header">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">${c(`volume`,`h-4 w-4`)}</span>
              <div>
                <h2 class="card-title">Output</h2>
                <p class="card-subtitle" data-result-subtitle>No speech generated yet.</p>
              </div>
            </div>
            <a class="btn-ghost btn-xs hidden" data-download download>${c(`download`,`h-4 w-4`)} Download</a>
          </div>
          <div class="p-4 sm:p-5" data-result></div>
        </section>
      </aside>
    </div>
  `;let E=t=>v(e,t),O=e.querySelector(`[data-model]`),k=E(`[data-voice]`),A=E(`[data-status]`),j=E(`[data-model-chip]`),M=E(`[data-phase-wrap]`),N=E(`[data-phase]`),P=E(`[data-result]`),F=E(`[data-result-subtitle]`),I=E(`[data-download]`),L=E(`[data-generate]`),R=E(`[data-stop]`),z=E(`[data-speed]`),B=E(`[data-speed-number]`),V=E(`[data-speed-label]`),H=E(`[data-text]`);function U(e,t){T=e,A.textContent=e,t!==void 0&&(j.textContent=t?`Running`:`Idle`,j.className=`chip ${t?`chip-success`:``}`)}function W(){if(!f.length)k.innerHTML=`<option value="">Default voice</option>`,k.disabled=!0;else{k.disabled=!1;let e=k.value,t=f.includes(e)?e:f[0];k.innerHTML=f.map(e=>`<option value="${o(e)}" ${e===t?`selected`:``}>${o(e)}</option>`).join(``),k.value=t}E(`[data-voice-status]`).textContent=f.length?`${f.length} voice${f.length===1?``:`s`} available.`:`Voices are listed from the running server.`}function ee(){let t=e.querySelector(`[data-saved-voices-panel]`);t&&(m.length?(t.innerHTML=`
      <div class="mb-2 flex items-center justify-between gap-2">
        <p class="text-xs font-semibold text-slate-300">Saved voices</p>
        <span class="text-[11px] text-slate-500">${m.length}</span>
      </div>
      <ul class="space-y-1.5">
        ${m.map(e=>`
          <li class="flex items-center gap-2 rounded-lg border border-subtle bg-ink-950/40 px-2.5 py-1.5">
            <span class="min-w-0 flex-1 truncate text-xs text-slate-300">${o(e)}</span>
            <button type="button" class="btn-ghost btn-xs shrink-0 text-rose-300 hover:bg-rose-500/10" data-delete-voice="${o(e)}" title="Delete ${o(e)}">${c(`trash`,`h-3.5 w-3.5`)}</button>
          </li>`).join(``)}
      </ul>
    `,t.querySelectorAll(`[data-delete-voice]`).forEach(e=>{e.addEventListener(`click`,()=>{ce(e.dataset.deleteVoice||``,e)})})):t.innerHTML=`<p class="text-[11px] leading-5 text-slate-500">No saved custom voices yet. Upload a reference clip above and save it to reuse it here and in Chat.</p>`)}async function te(){try{m=(await r(`/api/audio/saved-voices`)).voices||[]}catch{m=[]}ee()}function ne(){w?(I.href=w.url,I.classList.remove(`hidden`),F.textContent=w.filename||`Generated speech`,P.innerHTML=`
      <div class="rounded-2xl border border-subtle bg-raised p-5">
        <div class="mb-4 flex items-center gap-3">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">${c(`volume`,`h-5 w-5`)}</span>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-slate-200">${o(w.filename||`Generated speech`)}</p>
            <p class="text-xs text-slate-500">audio.cpp</p>
          </div>
        </div>
        <audio class="w-full" controls autoplay src="${o(w.url)}"></audio>
      </div>
    `):(I.classList.add(`hidden`),F.textContent=`No speech generated yet.`,P.innerHTML=y(`Your audio will appear here`,`Enter some text and press Generate speech. The local model starts automatically on the first run.`,`volume`))}function G(e){S=e,L.disabled=e||!u.length,L.innerHTML=e?`${l(`h-4 w-4`)} Generating…`:`${c(`play`,`h-4 w-4`)} Generate speech`,R.disabled=!e,M.classList.toggle(`hidden`,!e)}async function re(){if(!d)return;let i=e.querySelector(`[data-load]`);g(i,!0,`Loading…`);try{let e=await r(`/api/audio/load`,{method:`POST`,body:{model_id:d}});f=e.voices||[],W(),U(e.status||``,e.loaded),n.refreshStatus(),p(`Audio model loaded.`,`success`)}catch(e){p(t(e),`error`)}finally{g(i,!1)}}async function ie(){let i=e.querySelector(`[data-unload]`);g(i,!0,`Stopping…`);try{let e=await r(`/api/audio/unload`,{method:`POST`});f=[],W(),U(e.status||``,e.loaded),n.refreshStatus(),p(`audio.cpp server stopped.`,`success`)}catch(e){p(t(e),`error`)}finally{g(i,!1)}}async function ae(){if(!d)return;let i=e.querySelector(`[data-refresh-voices]`);g(i,!0,`Loading…`);try{f=(await r(`/api/audio/voices?model_id=${encodeURIComponent(d)}`)).voices||[],W(),U(`audio.cpp server running.`,!0),n.refreshStatus(),p(`Loaded ${f.length} voice${f.length===1?``:`s`}.`,`success`)}catch(e){p(t(e),`error`)}finally{g(i,!1)}}async function K(e){let t=await i(e);_={id:t.id,url:t.url,name:t.name||e.name},ue(),p(`Reference clip ready.`,`success`)}function oe(e,t){D({source:e,name:t||`reference`,title:`Trim reference clip`,subtitle:`Choose the part of the clip to keep before uploading. Trimmed selections are saved as WAV.`,onApply:e=>K(e)})}async function se(){if(!_){p(`Upload a reference clip first.`,`warning`);return}let n=x.trim();if(!n){p(`Give the voice a name first.`,`warning`);return}let i=e.querySelector(`[data-save-voice]`);g(i,!0,`Saving…`);try{let e=await r(`/api/audio/save-voice`,{method:`POST`,body:{model_id:d,name:n,upload:_.id,transcript:b}});f=e.voices||[],W(),k.value=e.name||``,x=``,await te(),ue(),p(e.status,`success`)}catch(e){p(t(e),`error`)}finally{g(i,!1)}}async function ce(e,n){if(await h(`Delete the saved voice “${e}”? Its reference clip and transcript entry will be removed.`,{title:`Delete saved voice`,confirmLabel:`Delete`,danger:!0})){g(n,!0,`Deleting…`);try{let t=await r(`/api/audio/delete-voice`,{method:`POST`,body:{name:e}});m=t.voices||m.filter(t=>t!==e),ee(),f=f.filter(n=>n!==e&&n!==t.name),W(),p(t.status,`success`)}catch(e){p(t(e),`error`),n.isConnected&&g(n,!1)}}}async function q(){if(S||!d)return;let e=H.value.trim();if(!e)p(`Type the text to speak first.`,`warning`);else{G(!0),N.textContent=`Starting audio.cpp…`,w=null,ne(),C=new AbortController;try{await a(`/api/audio/generate`,{model_id:d,text:e,voice:k.value||null,speed:Number(B.value)||1,seed:Number(E(`[data-seed]`).value)||0,max_tokens:Number(E(`[data-max-tokens]`).value)||0,voice_ref:_?.id||null,reference_text:b},e=>{e.type===`phase`?N.textContent=e.message||``:e.type===`result`?(w={...e,url:e.url||``,filename:`generated-speech.wav`},ne()):e.type===`error`?p(e.message,`error`):e.type===`done`&&(N.textContent=`Done.`)},C.signal)}catch(e){e.name!==`AbortError`&&p(t(e),`error`)}finally{G(!1),C=null,n.refreshStatus()}}}async function le(){try{await r(`/api/audio/cancel`,{method:`POST`}),C?.abort(),p(`Stopping speech generation…`,`warning`,1800)}catch(e){p(t(e),`error`)}}O?.addEventListener(`change`,()=>{d=O.value,f=[],k.value=``,W()}),e.querySelector(`[data-load]`)?.addEventListener(`click`,()=>{re()}),e.querySelector(`[data-unload]`)?.addEventListener(`click`,()=>{ie()}),e.querySelector(`[data-refresh-voices]`)?.addEventListener(`click`,()=>{ae()}),L.addEventListener(`click`,()=>{q()}),R.addEventListener(`click`,()=>{le()}),z.addEventListener(`input`,()=>{B.value=z.value,V.textContent=`${Number(z.value).toFixed(2)}×`}),B.addEventListener(`input`,()=>{let e=Math.min(2,Math.max(.5,Number(B.value)||1));z.value=String(e),V.textContent=`${e.toFixed(2)}×`});function ue(){let t=e.querySelector(`[data-ref-panel]`);t&&(t.innerHTML=`
      <div class="flex flex-wrap items-center gap-2">
        <label class="btn-secondary btn-xs cursor-pointer">
          ${c(`upload`,`h-3.5 w-3.5`)} ${_?`Replace clip`:`Upload reference clip`}
          <input type="file" accept="audio/*" class="sr-only" data-ref-upload />
        </label>
        ${_?`<span class="min-w-0 flex-1 truncate text-[11px] text-slate-400">${o(_.name||`Reference clip`)}</span>`:`<span class="text-[11px] text-slate-500">WAV, MP3, FLAC, OGG or M4A</span>`}
        ${_?`<button class="btn-ghost btn-xs" data-ref-trim>${c(`scissors`,`h-3.5 w-3.5`)} Trim</button>`:``}
        ${_?`<button class="btn-ghost btn-xs text-rose-300 hover:bg-rose-500/10" data-ref-clear>${c(`trash`,`h-3.5 w-3.5`)}</button>`:``}
      </div>
      ${_?`<audio class="mt-3 w-full" controls src="${o(_.url)}"></audio>`:``}
      <textarea class="textarea mt-3 text-xs" rows="2" data-ref-text placeholder="What is said in the clip? (optional, improves cloning)">${o(b)}</textarea>
      <div class="mt-3 flex flex-col gap-2 sm:flex-row">
        <input class="input min-w-0 flex-1" data-voice-name value="${o(x)}" placeholder="Save clip as voice, e.g. morgan" />
        <button class="btn-secondary btn-xs shrink-0" data-save-voice>${c(`save`,`h-4 w-4`)} Save voice</button>
      </div>
      <p class="mt-2 text-[11px] leading-5 text-slate-500">A reference clip overrides the Voice field. Saved voices are shared with the Chat page.</p>
    `,t.querySelector(`[data-ref-text]`)?.addEventListener(`input`,e=>{b=e.target.value}),t.querySelector(`[data-voice-name]`)?.addEventListener(`input`,e=>{x=e.target.value}),t.querySelector(`[data-save-voice]`)?.addEventListener(`click`,()=>{se()}),t.querySelector(`[data-ref-upload]`)?.addEventListener(`change`,e=>{let t=e.target,n=t.files?.[0];t.value=``,n&&oe(n,n.name)}),t.querySelector(`[data-ref-trim]`)?.addEventListener(`click`,()=>{_&&oe(_.url,_.name)}),t.querySelector(`[data-ref-clear]`)?.addEventListener(`click`,()=>{_=null,ue()}))}return ue(),W(),te(),ne(),G(!1),U(T,s.audio_loaded),()=>{S&&(C?.abort(),r(`/api/audio/cancel`,{method:`POST`}).catch(()=>{}))}}var de={images:{icon:`image`,noun:`image`,endpoint:`/api/gallery/images`,empty:`Generate an image in the Generate page or add one to the media folder, then press Refresh.`},audio:{icon:`music`,noun:`audio clip`,endpoint:`/api/gallery/audio`,empty:`Generate music or speech in ComfyUI or add audio to the media folder, then press Refresh.`},videos:{icon:`film`,noun:`video`,endpoint:`/api/gallery/videos`,empty:`Generate or upscale a video in ComfyUI or add one to the media folder, then press Refresh.`}};function fe(e){return(e.prompt||``).trim()}function pe(e,t){return e.type===`local`?`From the media folder`:t}function J(e){return e.subfolder?`${e.subfolder}/${e.filename}`:e.filename}function me(e){return[e.type||``,e.subfolder||``,e.filename,e.prompt_id||``].join(`\0`)}function he(e,t=``){let n=e.type===`local`;return`<span class="pointer-events-none inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur-sm ${t}">${c(n?`folder`:`cpu`,`h-3 w-3`)}${n?`Media`:`ComfyUI`}</span>`}function ge(e){if(typeof e==`string`)return e;try{return JSON.stringify(e,null,2)??String(e)}catch{return String(e)}}function Y(e,t){return`<details class="group mt-2 overflow-hidden rounded-xl border border-subtle bg-ink-950/60">
    <summary class="flex cursor-pointer list-none select-none items-center justify-between gap-2 px-3 py-2 text-[11px] font-medium text-slate-300">
      <span>${o(e)}</span>
      <span class="text-slate-500 transition group-open:rotate-180">${c(`chevron`,`h-3.5 w-3.5`)}</span>
    </summary>
    <pre class="max-h-72 overflow-auto border-t border-subtle p-3 font-mono text-[11px] leading-5 text-slate-300">${o(ge(t))}</pre>
  </details>`}function _e(){return`<section class="rounded-2xl border border-subtle bg-raised p-4" data-image-metadata>
    <div class="flex items-center gap-2 text-xs text-slate-500">${l(`h-4 w-4`)} Reading ComfyUI metadata…</div>
  </section>`}async function ve(e,n){if(!n)return;let i=new URLSearchParams({filename:e.filename||``,subfolder:e.subfolder||``,type:e.type||`output`});try{let e=await r(`/api/gallery/image-metadata?${i.toString()}`);if(!n.isConnected)return;let t=e?.metadata||{},a=(Array.isArray(t.summary)?t.summary:[]).filter(e=>e&&e.label&&e.value!==void 0&&e.value!==null&&e.value!==``),s=[[`Prompt (API format)`,t.prompt],[`Workflow (UI format)`,t.workflow],[`Parameters`,t.parameters],[`Comment`,t.comment],[`Description`,t.description],[`Title`,t.title]].filter(([,e])=>e!=null&&e!==``),c=a.length?`<dl class="mt-3 space-y-3">${a.map(e=>`<div>
              <dt class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">${o(e.label)}</dt>
              <dd class="mt-0.5 whitespace-pre-wrap break-words text-xs leading-5 text-slate-200">${o(e.value)}</dd>
            </div>`).join(``)}</dl>`:``,l=s.map(([e,t])=>Y(e,t)).join(``),u=!!(c||l);n.innerHTML=`
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">ComfyUI metadata</h3>
        ${u?`<span class="text-[10px] text-slate-500">Embedded in this image</span>`:``}
      </div>
      ${u?`${c}${l}`:`<p class="mt-2 text-xs text-slate-500">No ComfyUI metadata is embedded in this image.</p>`}
    `}catch(e){if(!n.isConnected)return;n.innerHTML=`<p class="text-xs leading-5 text-rose-300">Could not read metadata: ${o(t(e))}</p>`}}async function ye(e,n,i){let a=de[i],s=[],u=new Set,d=!1;e.innerHTML=`
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold tracking-tight text-slate-100">Recent ${i}</h2>
          <p class="mt-0.5 text-xs text-slate-500" data-count>Loading from ComfyUI history and the media folder…</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn-secondary btn-xs hidden" data-move-selected>${c(`folder`,`h-4 w-4`)} Move to media</button>
          <button class="btn-danger btn-xs hidden" data-delete-selected>${c(`trash`,`h-4 w-4`)} Delete selected</button>
          <button class="btn-secondary btn-xs" data-refresh>${c(`refresh`,`h-4 w-4`)} Refresh</button>
        </div>
      </div>
      <div data-grid></div>
    </div>
  `;let f=v(e,`[data-grid]`),g=v(e,`[data-count]`),_=v(e,`[data-refresh]`),b=v(e,`[data-delete-selected]`),x=v(e,`[data-move-selected]`);function S(){let e=s.filter(e=>u.has(me(e))),t=e.length,n=e.filter(e=>e.type!==`local`&&e.prompt_id).length;b.classList.toggle(`hidden`,t===0),b.disabled=d||t===0,b.innerHTML=`${c(`trash`,`h-4 w-4`)} Delete selected${t?` (${t})`:``}`,x.classList.toggle(`hidden`,n===0),x.disabled=d||n===0,x.innerHTML=`${c(`folder`,`h-4 w-4`)} Move to media${n?` (${n})`:``}`}function C(e,t){return`<label class="absolute bottom-2 right-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-white/20 bg-black/55 backdrop-blur-sm transition hover:bg-black/75" title="Select ${o(J(t))}">
      <input type="checkbox" class="h-4 w-4 cursor-pointer rounded border-white/40 bg-transparent accent-accent-500" data-select-item="${e}" ${u.has(me(t))?`checked`:``} aria-label="Select ${o(J(t))}" />
    </label>`}function w(){f.querySelectorAll(`[data-select-item]`).forEach(e=>{e.addEventListener(`change`,()=>{let t=s[Number(e.dataset.selectItem)];if(!t)return;e.checked?u.add(me(t)):u.delete(me(t));let n=e.closest(`[data-selectable]`);n&&(n.classList.toggle(`ring-2`,e.checked),n.classList.toggle(`ring-accent-400`,e.checked)),S()})})}function T(){return i===`audio`?`<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${Array.from({length:8}).map(()=>`<div class="skeleton h-28 rounded-2xl"></div>`).join(``)}
      </div>`:`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      ${Array.from({length:10}).map(()=>`<div class="skeleton aspect-square rounded-2xl"></div>`).join(``)}
    </div>`}function E(e){let t=fe(e);ve(e,m({title:J(e)||`Image`,subtitle:t||pe(e,`Generated by ComfyUI`),size:`lg`,content:`<div class="space-y-4">
        <div class="flex items-center justify-center overflow-hidden rounded-2xl border border-subtle bg-ink-950">
          <img src="${o(e.url)}" alt="${o(J(e))}" class="max-h-[72vh] w-full object-contain" />
        </div>
        ${_e()}
      </div>`,footer:`<div class="flex w-full items-center justify-between gap-3">
        <a class="btn-ghost btn-xs" href="${o(e.url)}" target="_blank" rel="noopener noreferrer">${c(`external`,`h-4 w-4`)} Open original</a>
        <a class="btn-secondary btn-xs" href="${o(e.url)}" download>${c(`download`,`h-4 w-4`)} Download</a>
      </div>`}).body.querySelector(`[data-image-metadata]`))}function D(e){let t=fe(e);m({title:J(e)||`Video`,subtitle:t||pe(e,`Generated by ComfyUI`),size:`lg`,content:`<div class="flex items-center justify-center overflow-hidden rounded-2xl border border-subtle bg-ink-950">
        <video class="max-h-[72vh] w-full" controls autoplay playsinline src="${o(e.url)}"${e.thumbnail_url?` poster="${o(e.thumbnail_url)}"`:``}></video>
      </div>`,footer:`<div class="flex w-full items-center justify-between gap-3">
        <a class="btn-ghost btn-xs" href="${o(e.url)}" target="_blank" rel="noopener noreferrer">${c(`external`,`h-4 w-4`)} Open original</a>
        <a class="btn-secondary btn-xs" href="${o(e.url)}" download>${c(`download`,`h-4 w-4`)} Download</a>
      </div>`})}function O(){g.textContent=`${s.length} ${a.noun}${s.length===1?``:`s`} in recent history and the media folder`,s.length?i===`images`?(f.innerHTML=`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        ${s.map((e,t)=>`
            <div class="relative rounded-2xl transition" data-selectable>
              <button class="gallery-tile group block aspect-square w-full text-left" data-image="${t}" title="${o(J(e))}">
                <img src="${o(e.thumbnail_url||e.url)}" data-full-src="${o(e.url)}" alt="${o(J(e))}" loading="lazy" class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                <span class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                  <span class="block truncate text-[11px] font-medium text-white">${o(J(e))}</span>
                  ${fe(e)?`<span class="mt-0.5 line-clamp-2 text-[10px] leading-4 text-white/60">${o(fe(e))}</span>`:``}
                </span>
              </button>
              ${he(e,`absolute left-2 top-2 z-10`)}
              ${C(t,e)}
            </div>
          `).join(``)}
      </div>`,f.querySelectorAll(`[data-image]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=s[Number(e.dataset.image)];t&&E(t)})}),f.querySelectorAll(`img[data-full-src]`).forEach(e=>{e.addEventListener(`error`,()=>{let t=e.dataset.fullSrc;t&&e.getAttribute(`src`)!==t?e.src=t:e.hidden=!0})}),w()):i===`audio`?(f.innerHTML=`<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${s.map((e,t)=>`
            <div class="card-soft p-4 transition" data-selectable>
              <div class="mb-3 flex items-center gap-3">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">${c(`music`,`h-4 w-4`)}</span>
                <div class="min-w-0">
                  <p class="truncate text-xs font-semibold text-slate-200">${o(J(e))}</p>
                  <p class="truncate text-[11px] text-slate-500">${o(fe(e)||pe(e,`Generated audio`))}</p>
                </div>
                ${he(e,`ml-auto shrink-0`)}
              </div>
              <audio class="w-full" controls preload="none" src="${o(e.url)}"></audio>
              <div class="mt-3 flex items-center justify-between gap-3">
                <a class="btn-ghost btn-xs" href="${o(e.url)}" download>${c(`download`,`h-4 w-4`)} Download</a>
                <label class="flex cursor-pointer items-center gap-2 text-[11px] text-slate-500" title="Select ${o(J(e))}">
                  <span>Select</span>
                  <input type="checkbox" class="h-4 w-4 cursor-pointer rounded border-white/30 bg-transparent accent-accent-500" data-select-item="${t}" ${u.has(me(e))?`checked`:``} aria-label="Select ${o(J(e))}" />
                </label>
              </div>
            </div>
          `).join(``)}
      </div>`,w()):(f.innerHTML=`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      ${s.map((e,t)=>`
          <div class="relative rounded-2xl transition" data-selectable>
            <button class="gallery-tile group block aspect-square w-full text-left" data-video="${t}" title="${o(J(e))}">
              <span class="absolute inset-0 flex items-center justify-center text-slate-600">${c(`film`,`h-8 w-8`)}</span>
              ${e.thumbnail_url?`<img src="${o(e.thumbnail_url)}" data-thumbnail alt="${o(J(e))}" loading="lazy" class="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />`:``}
              <span class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/25">
                <span class="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm">
                  ${c(`play`,`h-5 w-5`)}
                </span>
              </span>
              <span class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                <span class="block truncate text-[11px] font-medium text-white">${o(J(e))}</span>
                ${fe(e)?`<span class="mt-0.5 line-clamp-2 text-[10px] leading-4 text-white/60">${o(fe(e))}</span>`:``}
              </span>
            </button>
            ${he(e,`absolute left-2 top-2 z-10`)}
            ${C(t,e)}
          </div>
        `).join(``)}
    </div>`,f.querySelectorAll(`[data-video]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=s[Number(e.dataset.video)];t&&D(t)})}),f.querySelectorAll(`img[data-thumbnail]`).forEach(e=>{e.addEventListener(`error`,()=>e.remove())}),w()):f.innerHTML=`<div class="card">${y(`No ${i} yet`,a.empty,a.icon)}</div>`}async function k(){if(d)return;let e=s.filter(e=>u.has(me(e))),n=e.filter(e=>e.type!==`local`&&e.prompt_id),i=e.length-n.length;if(!n.length)return;let a=new Set(n.map(e=>e.prompt_id)),o=`Move ${n.length} selected item${n.length===1?``:`s`} to the media folder? This copies all outputs from ${a.size} ComfyUI generation${a.size===1?``:`s`} and removes those history entries.`;if(i&&(o+=` ${i} local item${i===1?``:`s`} in the selection are already in the media folder and will be left untouched.`),await h(o,{title:`Move selected media?`,confirmLabel:`Move`})){x.disabled=!0,x.innerHTML=`${l(`h-4 w-4`)} Moving…`;try{let e=await r(`/api/gallery/move`,{method:`POST`,body:{items:n.map(e=>({filename:e.filename,subfolder:e.subfolder||``,type:e.type||``,prompt_id:e.prompt_id}))}}),t=[];e?.moved&&t.push(`${e.moved} file${e.moved===1?``:`s`} moved`),e?.deleted_history&&t.push(`${e.deleted_history} history entr${e.deleted_history===1?`y`:`ies`} removed`),e?.failed&&t.push(`${e.failed} entr${e.failed===1?`y`:`ies`} could not be completed`),p(t.length?`${t.join(`, `)}.`:`Move complete.`,e?.failed?`warning`:`success`),u.clear(),await j()}catch(e){p(t(e),`error`)}finally{x.disabled=d||u.size===0,S()}}}async function A(){if(d||!u.size)return;let e=s.filter(e=>u.has(me(e)));if(!e.length){u.clear(),S();return}let n=new Set(e.filter(e=>e.prompt_id).map(e=>e.prompt_id)),i=e.filter(e=>e.type===`local`).length,a=`Delete ${e.length} selected item${e.length===1?``:`s`}?`;if(n.size&&(a+=` This removes ${n.size} ComfyUI history ${n.size===1?`entry`:`entries`}; all outputs from those entries are removed.`),i&&(a+=` ${i} local media file${i===1?``:`s`} will be permanently deleted from the media folder.`),await h(a,{title:`Delete selected media?`,confirmLabel:`Delete`,danger:!0})){b.disabled=!0,b.innerHTML=`${l(`h-4 w-4`)} Deleting…`;try{let t=await r(`/api/gallery/delete`,{method:`POST`,body:{items:e.map(e=>({filename:e.filename,subfolder:e.subfolder||``,type:e.type||``,prompt_id:e.prompt_id||``}))}}),n=[];t?.deleted_history&&n.push(`${t.deleted_history} history ${t.deleted_history===1?`entry`:`entries`}`),t?.deleted_local&&n.push(`${t.deleted_local} local ${t.deleted_local===1?`file`:`files`}`),p(n.length?`Deleted ${n.join(` and `)}.`:`Deleted selected items.`,`success`),u.clear(),await j()}catch(e){p(t(e),`error`)}finally{b.disabled=d||u.size===0,S()}}}async function j(){if(!d){d=!0,u.clear(),S(),_.disabled=!0,_.innerHTML=`${l(`h-4 w-4`)} Loading`,f.innerHTML=T();try{s=(await r(`${a.endpoint}?limit=300`)).items||[],O()}catch(e){let n=t(e);f.innerHTML=`<div class="card p-6 text-center">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">${c(`alert`,`h-6 w-6`)}</div>
        <p class="text-sm font-semibold text-slate-100">Could not load ${i}</p>
        <p class="mx-auto mt-2 max-w-lg whitespace-pre-wrap text-xs leading-5 text-slate-400">${o(n)}</p>
        <button class="btn-secondary btn-xs mt-4" data-retry>Try again</button>
      </div>`,f.querySelector(`[data-retry]`)?.addEventListener(`click`,()=>{j()}),p(n,`error`)}finally{d=!1,_.disabled=!1,_.innerHTML=`${c(`refresh`,`h-4 w-4`)} Refresh`,S()}}}return _.addEventListener(`click`,()=>{j()}),x.addEventListener(`click`,()=>{k()}),b.addEventListener(`click`,()=>{A()}),await j(),()=>{}}async function be(e){e.innerHTML=`
    <div class="mx-auto max-w-2xl space-y-5">
      <section class="card">
        <div class="card-header">
          <div class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300">${c(`cpu`,`h-4 w-4`)}</span>
            <div>
              <h2 class="card-title">Memory</h2>
              <p class="card-subtitle">Unload ComfyUI models and reclaim VRAM and RAM</p>
            </div>
          </div>
        </div>
        <div class="space-y-4 p-4 sm:p-5">
          <p class="rounded-xl border border-subtle bg-raised p-3 text-xs leading-5 text-slate-500">
            Ask ComfyUI to unload its loaded models or free cached memory. The next generation reloads the models automatically.
          </p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary" data-unload-models>${c(`cpu`,`h-4 w-4`)} Unload Models</button>
            <button type="button" class="btn-secondary" data-free-memory>${c(`sparkles`,`h-4 w-4`)} Free Memory</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <div class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300">${c(`trash`,`h-4 w-4`)}</span>
            <div>
              <h2 class="card-title">History</h2>
              <p class="card-subtitle">Manage the generation history recorded by ComfyUI</p>
            </div>
          </div>
        </div>
        <div class="space-y-4 p-4 sm:p-5">
          <div class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">
            Clearing the history removes every recorded generation and empties the image, audio and video galleries. Generated files already saved on disk are not deleted.
          </div>
          <button type="button" class="btn-danger" data-clear>${c(`trash`,`h-4 w-4`)} Clear History</button>
        </div>
      </section>
    </div>
  `;async function n(e,n,{busyLabel:i,successMessage:a,confirm:o,body:s}){if(!o||await h(o.message,o.options)){g(e,!0,i);try{p((await r(n,{method:`POST`,body:s}))?.status||a,`success`)}catch(e){p(t(e),`error`)}finally{g(e,!1)}}}let i=e.querySelector(`[data-unload-models]`);i?.addEventListener(`click`,()=>{n(i,`/free`,{busyLabel:`Unloading…`,successMessage:`Models unloaded.`,body:{unload_models:!0,free_memory:!1}})});let a=e.querySelector(`[data-free-memory]`);a?.addEventListener(`click`,()=>{n(a,`/free`,{busyLabel:`Freeing…`,successMessage:`Memory freed.`,body:{unload_models:!1,free_memory:!0}})});let o=e.querySelector(`[data-clear]`);return o?.addEventListener(`click`,()=>{n(o,`/history`,{busyLabel:`Clearing…`,successMessage:`History cleared.`,confirm:{message:`This removes every entry from ComfyUI's generation history. Generated files on disk are not deleted.`,options:{title:`Clear history?`,confirmLabel:`Clear History`,danger:!0}}})}),()=>{}}var xe=[{key:`generate`,label:`Generate`,title:`Generate`,subtitle:`Customize and run a ComfyUI workflow.`,icon:`generate`,render:G},{key:`chat`,label:`Chat`,title:`Chat`,subtitle:`Talk to a local GGUF model served by llama-server.`,icon:`chat`,render:le},{key:`tts`,label:`Text to Speech`,title:`Text to Speech`,subtitle:`Generate speech and manage cloned voices with audio.cpp.`,icon:`mic`,render:ue},{key:`images`,label:`Image Gallery`,title:`Image Gallery`,subtitle:`Browse images generated by ComfyUI.`,icon:`image`,render:(e,t)=>ye(e,t,`images`)},{key:`audio`,label:`Audio Gallery`,title:`Audio Gallery`,subtitle:`Browse audio generated by ComfyUI.`,icon:`music`,render:(e,t)=>ye(e,t,`audio`)},{key:`videos`,label:`Video Gallery`,title:`Video Gallery`,subtitle:`Browse videos generated by ComfyUI.`,icon:`film`,render:(e,t)=>ye(e,t,`videos`)},{key:`other`,label:`Other`,title:`Other`,subtitle:`Utilities and maintenance.`,icon:`settings`,render:be}],X={boot:null,page:null,cleanup:null,comfyBusy:!1,chatBusy:!1,audioBusy:!1};function Z(e){return document.getElementById(e)}function Q(e){let t=Z(e);if(!t)throw Error(`Missing element #${e}`);return t}function Se(){return document.documentElement.classList.contains(`light`)}function Ce(){let e=Z(`theme-toggle`);if(!e)return;let t=Se();e.innerHTML=c(t?`sun`:`moon`,`h-5 w-5`),e.title=t?`Switch to dark theme`:`Switch to light theme`,e.setAttribute(`aria-label`,t?`Switch to dark theme`:`Switch to light theme`);let n=document.querySelector(`meta[name="theme-color"]`);n&&(n.content=t?`#f8fafc`:`#070a12`)}function we(e,t=!0){if(document.documentElement.classList.toggle(`light`,e),t)try{localStorage.setItem(`opensail.theme`,e?`light`:`dark`)}catch{}Ce()}function Te(){we(!Se())}function Ee(){let e=window.matchMedia(`(prefers-color-scheme: light)`),t=e=>{let t=null;try{t=localStorage.getItem(`opensail.theme`)}catch{t=null}t||we(e.matches,!1)};e.addEventListener?e.addEventListener(`change`,t):e.addListener(t)}var De={get boot(){return X.boot},api:r,toast:p,refreshStatus:()=>Re(),navigate:e=>{window.location.hash=`#${e}`}};function Oe(){let e=(window.location.hash||`#generate`).replace(/^#/,``);return xe.find(t=>t.key===e)??xe[0]}function ke(){let e=Z(`nav-list`);if(!e)return;let t=Oe();e.innerHTML=xe.map(e=>`
      <a href="#${e.key}" class="nav-link group ${e.key===t.key?`nav-link-active`:``}" data-route="${e.key}">
        <span class="nav-icon">${c(e.icon,`h-[18px] w-[18px]`)}</span>
        <span class="min-w-0 flex-1 truncate">${e.label}</span>
        ${e.key===t.key?`<span class="h-1.5 w-1.5 rounded-full bg-accent-400"></span>`:``}
      </a>
    `).join(``)}function Ae(e){let t=Z(`sidebar`),n=Z(`mobile-overlay`);t?.classList.toggle(`-translate-x-full`,!e),n?.classList.toggle(`hidden`,!e)}async function $(){let e=Oe();if(X.page===e.key&&X.cleanup!==null)return;X.cleanup?.(),X.cleanup=null,X.page=e.key,ke(),Q(`page-title`).textContent=e.title,Q(`page-subtitle`).textContent=e.subtitle,Ae(!1);let n=Q(`main`);n.innerHTML=`
    <div class="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-slate-500">
      ${l(`h-7 w-7`)}
      <p class="text-xs font-medium uppercase tracking-wider">Loading ${e.label.toLowerCase()}…</p>
    </div>
  `;try{let t=await e.render(n,De);X.cleanup=typeof t==`function`?t:()=>{}}catch(e){console.error(e),n.innerHTML=`
      <div class="card mx-auto mt-10 max-w-lg p-6 text-center">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">
          ${c(`alert`,`h-6 w-6`)}
        </div>
        <h2 class="text-base font-semibold text-slate-100">Could not load this page</h2>
        <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">${t(e)}</p>
        <button class="btn-primary mt-5" id="page-retry">Try again</button>
      </div>
    `,n.querySelector(`#page-retry`)?.addEventListener(`click`,()=>{X.cleanup=null,X.page=null,$()}),X.cleanup=()=>{}}}var je={ok:{dot:`bg-emerald-400`,text:`text-emerald-300`},warn:{dot:`bg-amber-400`,text:`text-amber-300`},error:{dot:`bg-rose-400`,text:`text-rose-300`},idle:{dot:`bg-slate-500`,text:`text-slate-500`}};function Me(e,{tone:t,label:n,detail:r,action:i=!1}){let a=je[t]||je.idle,o=Z(`${e}-dot`),s=Z(`${e}-badge`),c=Z(`${e}-detail`),l=Z(`${e}-unload`);o&&(o.className=`h-1.5 w-1.5 shrink-0 rounded-full ${a.dot}`),s&&(s.textContent=n,s.className=`ml-auto text-[11px] ${a.text}`),c&&r!==void 0&&(c.textContent=r),l&&(l.disabled=!i)}function Ne({connected:e,managed:t,configured:n}){let r=Z(`comfy-start`),i=Z(`comfy-stop`);if(!r||!i)return;r.disabled=X.comfyBusy||e||t||!n,r.title=n?e||t?`ComfyUI is already running`:`Start ComfyUI`:`Set comfy_dir in configs/constants.json to start ComfyUI`,i.disabled=X.comfyBusy||!t,i.title=t?`Stop the ComfyUI process started by OpenSail`:`ComfyUI was not started by OpenSail`;let a=`idle`,o=`Not configured`;e?(a=`ok`,o=`Connected`):t?(a=`warn`,o=`Starting…`):n&&(a=`error`,o=`Not running`),Me(`comfy`,{tone:a,label:o});let s=Z(`comfy-badge`);s&&(s.title=e?t?`Started by OpenSail`:`Running outside OpenSail`:``)}function Pe({loaded:e,model:t}){X.boot?.chat_models?.length?e?Me(`chat`,{tone:`ok`,label:`Loaded`,detail:t||`Chat model loaded`,action:!X.chatBusy}):Me(`chat`,{tone:`idle`,label:`Idle`,detail:`No model loaded`}):Me(`chat`,{tone:`idle`,label:`Not configured`,detail:`No chat models configured`})}function Fe({loaded:e}){X.boot?.tts_models?.length?e?Me(`audio`,{tone:`ok`,label:`Running`,detail:`audio.cpp server`,action:!X.audioBusy}):Me(`audio`,{tone:`idle`,label:`Idle`,detail:`audio.cpp server stopped`}):Me(`audio`,{tone:`idle`,label:`Not configured`,detail:`No speech models configured`})}function Ie({connected:e=!1,managed:t=!1,unreachable:n=!1}={}){let r=Z(`connection-chip`);if(!r)return;let i=`bg-rose-400`,a=`ComfyUI offline`,o=`chip-danger`;n?a=`Server unreachable`:e?(i=`bg-emerald-400`,a=`ComfyUI connected`,o=`chip-success`):t&&(i=`bg-amber-400`,a=`ComfyUI starting`,o=`chip-warn`),r.className=`chip hidden sm:inline-flex ${o}`,r.innerHTML=`<span class="h-1.5 w-1.5 rounded-full ${i}"></span><span>${a}</span>`}function Le(){let e=X.boot;e&&(Q(`comfy-url`).textContent=e.comfy_url||`Unknown`,Ne({connected:!!e.comfy_managed,managed:!!e.comfy_managed,configured:!!e.comfy_configured}),Pe({loaded:!!e.chat_loaded,model:e.chat_model}),Fe({loaded:!!e.audio_loaded}))}async function Re(){try{let e=await r(`/api/status`),t=!!e.comfy,n=!!e.comfy_managed;Ie({connected:t,managed:n}),Ne({connected:t,managed:n,configured:!!e.comfy_configured}),Pe({loaded:!!e.chat_loaded,model:e.chat_model}),Fe({loaded:!!e.audio_loaded})}catch{Ie({unreachable:!0}),Ne({connected:!1,managed:!1,configured:!!X.boot?.comfy_configured})}}async function ze(){let e=Z(`chat-unload`);X.chatBusy=!0,g(e,!0,`Unloading…`);try{p((await r(`/api/chat/unload`,{method:`POST`})).status||`Chat model unloaded.`,`success`)}catch(e){p(t(e),`error`)}finally{X.chatBusy=!1,g(e,!1),await Re()}}async function Be(){let e=Z(`audio-unload`);X.audioBusy=!0,g(e,!0,`Stopping…`);try{p((await r(`/api/audio/unload`,{method:`POST`})).status||`audio.cpp server stopped.`,`success`)}catch(e){p(t(e),`error`)}finally{X.audioBusy=!1,g(e,!1),await Re()}}async function Ve(){let e=Z(`comfy-start`);X.comfyBusy=!0,g(e,!0,`Starting…`);try{p((await r(`/api/comfy/start`,{method:`POST`})).status||`ComfyUI started.`,`success`)}catch(e){p(t(e),`error`)}finally{X.comfyBusy=!1,g(e,!1),await Re()}}async function He(){let e=Z(`comfy-stop`);X.comfyBusy=!0,g(e,!0,`Stopping…`);try{p((await r(`/api/comfy/stop`,{method:`POST`})).status||`ComfyUI stopped.`,`success`)}catch(e){p(t(e),`error`)}finally{X.comfyBusy=!1,g(e,!1),await Re()}}async function Ue(){Ce(),Ee(),Q(`theme-toggle`).addEventListener(`click`,Te),Q(`menu-button`).addEventListener(`click`,()=>Ae(!0)),Q(`sidebar-close`).addEventListener(`click`,()=>Ae(!1)),Q(`mobile-overlay`).addEventListener(`click`,()=>Ae(!1)),Q(`comfy-start`).addEventListener(`click`,Ve),Q(`comfy-stop`).addEventListener(`click`,He),Q(`chat-unload`).addEventListener(`click`,ze),Q(`audio-unload`).addEventListener(`click`,Be),window.addEventListener(`hashchange`,()=>{X.cleanup?.(),X.cleanup=null,X.page=null,$()});try{X.boot=await r(`/api/bootstrap`)}catch(e){Q(`main`).innerHTML=`
      <div class="card mx-auto mt-10 max-w-lg p-6 text-center">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">
          ${c(`alert`,`h-6 w-6`)}
        </div>
        <h2 class="text-base font-semibold text-slate-100">OpenSail could not start</h2>
        <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">${t(e)}</p>
        <button class="btn-primary mt-5" onclick="window.location.reload()">Reload</button>
      </div>
    `;return}ke(),Le(),await $(),Re(),setInterval(Re,3e4)}Ue();
//# sourceMappingURL=app.js.map