var e=class extends Error{status;constructor(e,t=0){super(e),this.name=`ApiError`,this.status=t}};function t(e){return e instanceof Error?e.message:String(e??`Unknown error`)}async function n(e){try{let t=await e.json();if(t&&typeof t==`object`&&`detail`in t){let e=t.detail;if(typeof e==`string`)return e;if(e)return JSON.stringify(e)}}catch{}return e.statusText||`Request failed (${e.status})`}async function r(t,r={}){let{method:i=`GET`,body:a,signal:o,headers:s={}}=r,c={method:i,signal:o,headers:{...s}};a!==void 0&&(a instanceof FormData?c.body=a:(c.headers[`Content-Type`]=`application/json`,c.body=JSON.stringify(a)));let l=await fetch(t,c);if(!l.ok)throw new e(await n(l),l.status);return l.status===204?null:(l.headers.get(`content-type`)||``).includes(`application/json`)?await l.json():await l.text()}async function i(t){let r=new FormData;r.append(`file`,t,t.name||`upload`);let i=await fetch(`/api/uploads`,{method:`POST`,body:r});if(!i.ok)throw new e(await n(i),i.status);return await i.json()}async function a(t,r,i,a){let o=await fetch(t,{method:`POST`,headers:{"Content-Type":`application/json`,Accept:`text/event-stream`},body:JSON.stringify(r),signal:a});if(!o.ok)throw new e(await n(o),o.status);if(!o.body)throw new e(`The server returned an empty stream.`);let s=o.body.getReader(),c=new TextDecoder,l=``,u=e=>{for(let t of e.split(/\r?\n\r?\n/)){if(!t.trim())continue;let e=t.split(/\r?\n/).filter(e=>e.startsWith(`data:`)).map(e=>e.slice(5).trimStart()).join(`
`);if(e)try{i(JSON.parse(e))}catch(t){console.error(`Could not parse stream event`,e,t)}}};try{for(;;){let{value:e,done:t}=await s.read();if(t)break;l+=c.decode(e,{stream:!0});let n=l.search(/\r?\n\r?\n/);for(;n>=0;){let e=l.slice(n).match(/^\r?\n\r?\n/),t=e?e[0].length:2;u(l.slice(0,n)),l=l.slice(n+t),n=l.search(/\r?\n\r?\n/)}}l+=c.decode(),l.trim()&&u(l)}finally{s.releaseLock()}}function o(e){return String(e??``).replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function s(e){if(!e)return``;let t=new Date(e);return Number.isNaN(t.getTime())?``:t.toLocaleString(void 0,{year:`numeric`,month:`short`,day:`numeric`,hour:`numeric`,minute:`2-digit`})}var c={generate:`<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.5"/>`,chat:`<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.6A8.5 8.5 0 1 1 21 12Z"/><path d="M8 11h8M8 15h5"/>`,mic:`<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8"/>`,image:`<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-4.5-4.5L7 21"/>`,music:`<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>`,film:`<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>`,menu:`<path d="M4 7h16M4 12h16M4 17h16"/>`,close:`<path d="M6 6l12 12M18 6 6 18"/>`,upload:`<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>`,gallery:`<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m21 16-5-5L7 21"/><circle cx="8.5" cy="9.5" r="1.4"/>`,trash:`<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13H8L7 7"/><path d="M10 11v5m4-5v5"/>`,pencil:`<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m13.5 7.5 3 3"/>`,crop:`<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>`,scissors:`<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.2 7.4 20 18M8.2 16.6 20 6"/>`,play:`<path d="m8 5 11 7-11 7V5Z"/>`,stop:`<rect x="6" y="6" width="12" height="12" rx="2"/>`,refresh:`<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>`,settings:`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>`,check:`<path d="m5 12.5 4.5 4.5L19 7.5"/>`,alert:`<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3h.01"/>`,info:`<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>`,download:`<path d="M12 4v12m0 0 5-5m-5 5-5-5"/><path d="M5 20h14"/>`,external:`<path d="M14 4h6v6m0-6-9 9"/><path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4"/>`,plus:`<path d="M12 5v14M5 12h14"/>`,send:`<path d="m4 4 17 8-17 8 3-8-3-8Z"/><path d="M7 12h14"/>`,attach:`<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>`,cpu:`<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3m6-3v3M9 20v3m6-3v3M1 9h3m-3 6h3m16-6h3m-3 6h3"/><rect x="9" y="9" width="6" height="6" rx="1"/>`,volume:`<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>`,wand:`<path d="m4 20 10-10m-3-3 6 6"/><path d="M15 3v3m0 0v3m0-3h3m-3 0h-3M5 5v2m0 0v2m0-2h2M5 5H3"/>`,save:`<path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h9V3M7 21v-8h10v8"/>`,folder:`<path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>`,clock:`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,palette:`<path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h4.5A4.5 4.5 0 0 0 21 8.5C21 5.5 17 3 12 3Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="6.5" r="1"/><circle cx="14.5" cy="6.5" r="1"/>`,chevron:`<path d="m7 10 5 5 5-5"/>`,sparkles:`<path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>`,sun:`<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,moon:`<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"/>`};function l(e,t=`h-5 w-5`){return`<svg viewBox="0 0 24 24" class="${t}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${c[e]||c.info}</svg>`}function u(e=`h-4 w-4`){return`<svg class="${e} animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".2" stroke-width="3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`}function d(e){let t=o(e),n=[];return t=t.replace(/`([^`]+)`/g,(e,t)=>{let r=`\u0000INLINE${n.length}\u0000`;return n.push(`<code>${t}</code>`),r}),t=t.replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`),t=t.replace(/__([^_]+)__/g,`<strong>$1</strong>`),t=t.replace(/(^|[\s(])\*([^*\n]+)\*/g,`$1<em>$2</em>`),t=t.replace(/(^|[\s(])_([^_\n]+)_/g,`$1<em>$2</em>`),t=t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,`<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>`),t=t.replace(/\u0000INLINE(\d+)\u0000/g,(e,t)=>n[Number(t)]??``),t}function f(e){if(!e)return``;let t=[],n=String(e).replace(/```([\w+-]*)\r?\n?([\s\S]*?)```/g,(e,n,r)=>{let i=`\u0000BLOCK${t.length}\u0000`;return t.push(`<pre><code>${o(r.replace(/\n$/,``))}</code></pre>`),i}).replace(/\r\n/g,`
`).split(`
`),r=[],i=[],a=null,s=()=>{i.length&&(r.push(`<p>${d(i.join(` `))}</p>`),i=[])},c=()=>{a&&=(r.push(`</${a}>`),null)};for(let e of n){let n=e.trimEnd();if(!n.trim()){s(),c();continue}let o=n.match(/^\u0000BLOCK(\d+)\u0000$/);if(o){s(),c(),r.push(t[Number(o[1])]??``);continue}let l=n.match(/^(#{1,4})\s+(.*)$/);if(l){s(),c();let e=l[1].length;r.push(`<h${e}>${d(l[2])}</h${e}>`);continue}if(/^---+$/.test(n.trim())){s(),c(),r.push(`<hr>`);continue}let u=n.match(/^>\s?(.*)$/);if(u){s(),c(),r.push(`<blockquote>${d(u[1])}</blockquote>`);continue}let f=n.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);if(f){s();let e=/\d+\./.test(f[1])?`ol`:`ul`;a!==e&&(c(),a=e,r.push(`<${e}>`)),r.push(`<li>${d(f[2])}</li>`)}else c(),i.push(n.trim())}return s(),c(),r.join(``)}function p(e){return o(e||``).replace(/\n/g,`<br>`)}function m(e,t=`info`,n=4800){let r=document.getElementById(`toast-root`);if(!r)return;let i={info:`border-sky-400/20 bg-sky-400/10 text-sky-100`,success:`border-emerald-400/20 bg-emerald-400/10 text-emerald-100`,warning:`border-amber-400/20 bg-amber-400/10 text-amber-100`,error:`border-rose-400/20 bg-rose-400/10 text-rose-100`},a={info:`info`,success:`check`,warning:`alert`,error:`alert`},s=document.createElement(`div`);s.className=`toast`,s.setAttribute(`role`,t===`error`?`alert`:`status`),s.innerHTML=`
    <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${i[t]||i.info}">
      ${l(a[t]||`info`,`h-4 w-4`)}
    </span>
    <p class="min-w-0 flex-1 whitespace-pre-wrap break-words">${o(e)}</p>
    <button class="icon-btn -mr-1 -mt-1 h-7 w-7" aria-label="Dismiss">${l(`close`,`h-4 w-4`)}</button>
  `;let c=()=>{s.classList.add(`opacity-0`,`translate-y-1`),s.style.transition=`opacity 160ms ease, transform 160ms ease`,setTimeout(()=>s.remove(),180)};s.querySelector(`button`)?.addEventListener(`click`,c),r.appendChild(s),n&&setTimeout(c,n)}function h({title:e=``,subtitle:t=``,content:n=``,footer:r=null,size:i=`md`,onClose:a=null}={}){let s=document.getElementById(`modal-root`),c=document.createElement(`div`);c.className=`modal-backdrop`,c.innerHTML=`
    <div class="modal-panel ${i===`lg`?`modal-panel-lg`:``}" role="dialog" aria-modal="true" aria-label="${o(e)}">
      <div class="flex shrink-0 items-start gap-3 border-b border-subtle px-4 py-4 sm:px-6">
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold tracking-tight text-slate-100">${o(e)}</h2>
          ${t?`<p class="mt-0.5 text-xs leading-5 text-slate-400">${o(t)}</p>`:``}
        </div>
        <button class="icon-btn -mr-2 h-10 w-10 shrink-0 touch-manipulation sm:h-9 sm:w-9" data-modal-close aria-label="Close">${l(`close`)}</button>
      </div>
      <div class="modal-body" data-modal-body></div>
    </div>
  `;let u=c.querySelector(`.modal-panel`),d=c.querySelector(`[data-modal-body]`);if(!u||!d)throw Error(`Modal template is missing its panel.`);if(n instanceof Node?d.appendChild(n):d.innerHTML=n,r){let e=document.createElement(`div`);e.className=`flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-subtle bg-ink-900/95 px-4 py-3 sm:px-6`,r instanceof Node?e.appendChild(r):e.innerHTML=r,u.appendChild(e)}let f=!1,p=()=>{f||(f=!0,document.removeEventListener(`keydown`,m),document.body.classList.remove(`overflow-hidden`),c.remove(),a?.())},m=e=>{e.key===`Escape`&&p()};return c.querySelector(`[data-modal-close]`)?.addEventListener(`click`,p),c.addEventListener(`mousedown`,e=>{e.target===c&&p()}),document.addEventListener(`keydown`,m),document.body.classList.add(`overflow-hidden`),s?.appendChild(c),setTimeout(()=>{c.querySelector(`input, textarea, select, button:not([data-modal-close])`)?.focus?.({preventScroll:!0})},30),{close:p,element:c,body:d,panel:u}}function g(e,{title:t=`Are you sure?`,confirmLabel:n=`Confirm`,danger:r=!1}={}){return new Promise(i=>{let a=document.createElement(`div`);a.className=`flex items-center justify-end gap-2`,a.innerHTML=`
      <button class="btn-secondary" data-cancel>Cancel</button>
      <button class="${r?`btn-danger`:`btn-primary`}" data-confirm>${o(n)}</button>
    `;let s=!1,c=h({title:t,content:`<p class="text-sm leading-6 text-slate-300">${o(e)}</p>`,footer:a,onClose:()=>{s||i(!1)}});a.querySelector(`[data-cancel]`)?.addEventListener(`click`,()=>{s=!0,c.close(),i(!1)}),a.querySelector(`[data-confirm]`)?.addEventListener(`click`,()=>{s=!0,c.close(),i(!0)})})}function _(e,t,n=`Working…`){e&&(t?(e.dataset.originalHtml=e.innerHTML,e.disabled=!0,e.innerHTML=`${u(`h-4 w-4`)}<span>${o(n)}</span>`):(e.disabled=!1,e.dataset.originalHtml&&(e.innerHTML=e.dataset.originalHtml,delete e.dataset.originalHtml)))}function v(e,t,n){return Math.min(n,Math.max(t,e))}function y(e,t){let n=e.querySelector(t);if(!n)throw Error(`Missing element: ${t}`);return n}function b(e,t,n=`info`){return`
    <div class="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-subtle bg-raised text-slate-500">
        ${l(n,`h-6 w-6`)}
      </div>
      <div>
        <p class="text-sm font-semibold text-slate-200">${o(e)}</p>
        <p class="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">${o(t)}</p>
      </div>
    </div>
  `}var x=.05;function S(e){let t=Math.max(0,e),n=Math.floor(t/60);return`${n}:${(t-n*60).toFixed(1).padStart(4,`0`)}`}function C(e){return`${String(e||`audio`).replace(/\.[^./\\]+$/,``)||`audio`}-trim.wav`}function w(e,t,n){for(let r=0;r<n.length;r+=1)e.setUint8(t+r,n.charCodeAt(r))}function T(e,t,n){let r=Math.max(0,Math.floor(t*e.sampleRate)),i=Math.min(e.length,Math.ceil(n*e.sampleRate)),a=Math.max(1,i-r),o=Math.max(1,Math.min(2,e.numberOfChannels)),s=e.sampleRate,c=o*2,l=a*c,u=new ArrayBuffer(44+l),d=new DataView(u);w(d,0,`RIFF`),d.setUint32(4,36+l,!0),w(d,8,`WAVE`),w(d,12,`fmt `),d.setUint32(16,16,!0),d.setUint16(20,1,!0),d.setUint16(22,o,!0),d.setUint32(24,s,!0),d.setUint32(28,s*c,!0),d.setUint16(32,c,!0),d.setUint16(34,16,!0),w(d,36,`data`),d.setUint32(40,l,!0);let f=[];for(let t=0;t<o;t+=1)f.push(e.getChannelData(t));let p=44;for(let e=r;e<r+a;e+=1)for(let t=0;t<o;t+=1){let n=Math.max(-1,Math.min(1,f[t][e]||0));d.setInt16(p,n<0?n*32768:n*32767,!0),p+=2}return new Blob([u],{type:`audio/wav`})}function E(e,t){let n=Math.max(1,Math.min(2,e.numberOfChannels)),r=[];for(let t=0;t<n;t+=1)r.push(e.getChannelData(t));let i=r[0],a=Math.max(1,Math.floor(i.length/t)),o=[];for(let e=0;e<t;e+=1){let t=e*a,n=Math.min(i.length,t+a),s=0,c=0;for(let e=t;e<n;e+=1)for(let t=0;t<r.length;t+=1){let n=r[t][e];n<s&&(s=n),n>c&&(c=n)}o.push([s,c])}return o}function D(e,t,n,r){let i=e.getBoundingClientRect(),a=Math.max(1,Math.round(i.width)),o=Math.max(1,Math.round(i.height)),s=window.devicePixelRatio||1;e.width=Math.round(a*s),e.height=Math.round(o*s);let c=e.getContext(`2d`);if(!c)return;c.setTransform(s,0,0,s,0,0),c.clearRect(0,0,a,o);let l=o/2,u=Math.max(1,o/2-2),d=(e,n,r)=>{c.strokeStyle=r,c.beginPath();for(let r=Math.max(0,e);r<n;r+=1){let[e,n]=t[r]??[0,0];c.moveTo(r+.5,l+e*u),c.lineTo(r+.5,l+n*u)}c.stroke()};d(0,a,`rgba(148, 163, 184, 0.42)`),d(Math.round(n*a),Math.round(r*a),`#818cf8`),c.strokeStyle=`rgba(148, 163, 184, 0.16)`,c.beginPath(),c.moveTo(0,l+.5),c.lineTo(a,l+.5),c.stroke()}async function O({source:e,name:n=`audio`,title:r=`Trim audio`,subtitle:i=`Choose the part of the clip to keep before uploading.`,onApply:a}){let s=e instanceof Blob,c=s?URL.createObjectURL(e):e,d=s,f=null,p=null,g=0,v=null,y=null,b=null,w=null,O=null,k=null,A=null,j=null,ee=null,M=0,N=0,P=null,F=!1,I=null,te=!1,L=h({title:r,subtitle:i,size:`lg`,content:`<div class="flex min-h-40 items-center justify-center text-slate-500">${u(`h-6 w-6`)}</div>`,footer:`
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <button class="btn-secondary" data-audio-cancel>Cancel</button>
        <button class="btn-primary" data-audio-apply disabled>${l(`check`,`h-4 w-4`)} Apply trim</button>
      </div>
    `,onClose:()=>{te=!0,P?.pause(),F&&=!1,d&&c&&URL.revokeObjectURL(c),d=!1,I&&window.removeEventListener(`resize`,I),I=null}}),R=L.element.querySelector(`[data-audio-apply]`);L.element.querySelector(`[data-audio-cancel]`)?.addEventListener(`click`,()=>L.close()),R?.addEventListener(`click`,async()=>{if(a){_(R,!0,`Applying…`);try{let t=null;if(!f)t=p;else{let r=Math.min(x,g||x),i=Math.max(0,Math.min(M,g)),a=Math.min(g,Math.max(N,i));if(a-i<r){m(`Choose a longer section to keep.`,`warning`),_(R,!1);return}if(i<=.005&&a>=g-.005&&e instanceof File)t=e;else{let e=T(f,i,a);t=new File([e],C(n),{type:`audio/wav`})}}if(!t){_(R,!1);return}await a(t),L.close()}catch(e){m(t(e)||`Could not use the trimmed audio.`,`error`),_(R,!1)}}});let z=(e,t)=>{p=e,L.body.innerHTML=`
      <div class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm leading-6 text-rose-200">
        <p class="font-medium">Could not decode this audio for trimming.</p>
        <p class="mt-1 text-xs text-rose-200/80">${o(t)}</p>
        ${e?`<p class="mt-2 text-xs text-rose-200/80">You can still use the original file without trimming.</p>`:`<p class="mt-2 text-xs text-rose-200/80">Choose another file, or use a WAV, MP3, OGG or M4A clip.</p>`}
      </div>
    `,R&&e&&(R.disabled=!1,R.innerHTML=`${l(`upload`,`h-4 w-4`)} Use original`)};try{let t=s?await e.arrayBuffer():await(await fetch(e)).arrayBuffer(),n=window.AudioContext||window.webkitAudioContext;if(!n)throw Error(`Web Audio is not available in this browser.`);let r=new n;try{f=await r.decodeAudioData(t)}finally{r.close?.().catch(()=>{})}if(g=f.duration,!Number.isFinite(g)||g<=0)throw Error(`The audio file is empty.`)}catch(r){if(te)return;p=s?e instanceof File?e:new File([e],n,{type:e.type||`application/octet-stream`}):null,z(p,t(r)||`The browser could not read this file.`);return}if(te)return;L.body.innerHTML=`
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-3 rounded-xl border border-subtle bg-raised px-3 py-2">
        <span class="min-w-0 truncate text-[11px] text-slate-500">Source: ${o(n)}</span>
        <span class="shrink-0 font-mono text-[11px] text-slate-400">${S(g)}</span>
      </div>
      <audio class="w-full" controls preload="metadata" src="${o(c)}" data-audio-preview></audio>
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
        <button type="button" class="btn-ghost btn-xs" data-play-selection>${l(`play`,`h-3.5 w-3.5`)} Play selection</button>
        <button type="button" class="btn-ghost btn-xs" data-reset-selection>${l(`refresh`,`h-3.5 w-3.5`)} Reset</button>
        <span class="ml-auto text-[11px] text-slate-500" data-selection-length></span>
      </div>
    </div>
  `;let B=f;if(!B)return;P=L.body.querySelector(`[data-audio-preview]`),j=L.body.querySelector(`[data-audio-waveform]`),v=L.body.querySelector(`[data-start]`),y=L.body.querySelector(`[data-end]`),b=L.body.querySelector(`[data-start-label]`),w=L.body.querySelector(`[data-end-label]`),O=L.body.querySelector(`[data-shade-left]`),k=L.body.querySelector(`[data-shade-right]`),A=L.body.querySelector(`[data-audio-selection]`);let V=L.body.querySelector(`[data-selection-length]`),H=Math.min(x,g);v&&(v.max=String(Math.max(0,g-H))),y&&(y.max=String(g)),v&&(v.value=`0`),y&&(y.value=String(g)),M=0,N=g;let U=()=>{if(!j)return;let e=Math.max(1,Math.round(j.getBoundingClientRect().width));ee&&ee.width===e||(ee={width:e,values:E(B,e)}),D(j,ee.values,g?M/g:0,g?N/g:1)},ne=()=>{let e=g?M/g*100:0,t=g?N/g*100:100;O&&(O.style.width=`${e}%`),k&&(k.style.left=`${t}%`),A&&(A.style.left=`${e}%`,A.style.width=`${Math.max(0,t-e)}%`),b&&(b.textContent=S(M)),w&&(w.textContent=S(N)),V&&(V.textContent=`Keeping ${S(Math.max(0,N-M))}`),U()};v?.addEventListener(`input`,()=>{v&&(M=Math.max(0,Math.min(Number(v.value),N-H)),v.value=String(M),ne())}),y?.addEventListener(`input`,()=>{y&&(N=Math.min(g,Math.max(Number(y.value),M+H)),y.value=String(N),ne())}),L.body.querySelector(`[data-reset-selection]`)?.addEventListener(`click`,()=>{M=0,N=g,v&&(v.value=`0`),y&&(y.value=String(g)),ne()}),L.body.querySelector(`[data-play-selection]`)?.addEventListener(`click`,async()=>{if(P){F=!0,P.currentTime=M;try{await P.play()}catch(e){F=!1,m(t(e)||`Could not play the clip.`,`error`)}}}),P?.addEventListener(`timeupdate`,()=>{P&&F&&P.currentTime>=N-.02&&(F=!1,P.pause(),P.currentTime=Math.min(N,g))}),P?.addEventListener(`pause`,()=>{F=!1}),P?.addEventListener(`ended`,()=>{F=!1}),R&&(R.innerHTML=`${l(`check`,`h-4 w-4`)} Apply trim`,R.disabled=!1),ne(),I=()=>{ee=null,U()},window.addEventListener(`resize`,I)}var k={image:`Image`,audio:`Audio`,video:`Video`};function A(e){return`/api/workflows/${encodeURIComponent(e)}`}function j(e,t){let n=new Set((e?.candidates||[]).map(e=>e.id));return Object.fromEntries(Object.entries(t||{}).filter(([e])=>n.has(e)))}function ee(e,t){let n=new Set(e?.selected||[]);return Object.fromEntries(Object.entries(t||{}).filter(([e])=>n.has(e)))}function M(e){return e?e.upload?{upload:e.upload,gallery:null}:e.gallery?{upload:null,gallery:{filename:e.gallery.filename,subfolder:e.gallery.subfolder||``,type:e.gallery.type||`output`}}:null:null}var N={running:!1,result:null,error:``,progress:null,workflow:null,startedAt:0,elapsedMs:0,doneAt:0,listeners:new Set},P=500,F=null,I=!1;function te(){return N.running&&N.startedAt?performance.now()-N.startedAt:N.elapsedMs}function L(){return{running:N.running,result:N.result,error:N.error,progress:N.progress,workflow:N.workflow,elapsedMs:te(),doneAt:N.doneAt}}function R(){let e=L();for(let t of[...N.listeners])try{t(e)}catch(e){console.error(e)}}function z(e){return N.listeners.add(e),e(L()),()=>{N.listeners.delete(e)}}function B(){N.startedAt&&=(N.elapsedMs=performance.now()-N.startedAt,0),N.running=!1}function V(){F&&clearTimeout(F),F=null}function H(e=P){F&&clearTimeout(F),F=setTimeout(()=>{ne()},e)}function U(e){let t=N.running,n=N.error,r=Number(e.elapsed_ms)||0;N.running=!!e.running,N.workflow=e.workflow||null,N.error=e.error||``,N.result=e.result||null,N.progress=e.progress?{value:Number(e.progress.value)||0,message:e.progress.message||``,indeterminate:!!e.progress.indeterminate}:null,N.running?(N.startedAt=performance.now()-r,N.elapsedMs=r,N.doneAt=0):(N.startedAt=0,N.elapsedMs=r,!N.error&&N.result?(N.progress={value:1,message:`Done.`,indeterminate:!1},t&&(N.doneAt=performance.now())):N.doneAt=0),t&&N.error&&N.error!==n&&m(N.error,N.error===`Generation cancelled.`?`warning`:`error`),R(),N.running?H():V()}async function ne(){if(F=null,N.running){if(I)H();else{I=!0;try{U(await r(`/api/generate/status`))}catch{N.running&&H(P*2)}finally{I=!1}}}}async function re(){if(I)return H(0),L();I=!0;try{U(await r(`/api/generate/status`))}catch{N.running&&H(P*2)}finally{I=!1}return L()}async function ie(e){V(),N.running=!0,N.result=null,N.error=``,N.workflow=e.workflow||null,N.progress={value:0,message:`Preparing…`,indeterminate:!0},N.startedAt=performance.now(),N.elapsedMs=0,N.doneAt=0,R();try{U(await r(`/api/generate`,{method:`POST`,body:e}))}catch(e){if(e.status===409)try{U(await r(`/api/generate/status`));return}catch{}N.error=t(e)||`Generation failed.`,B(),m(N.error,`error`),R()}}document.addEventListener(`visibilitychange`,()=>{document.visibilityState===`visible`&&re()});async function ae(e,n){await re();let a=n.boot;if(!a)throw Error(`Generate page requires the bootstrap payload.`);let c=a.workflows||[],d=null,p=a.default_workflow||c[0]?.name||null;N.workflow&&(N.running||N.result||N.error)&&(p=N.workflow);let x=!0,S=null,C=!1,w=!!p&&N.workflow===p,T={values:{},images:[],audio:null,video:null,running:N.running,result:w?N.result:null,error:w?N.error:``,elapsedMs:te(),timer:null,unsubscribe:null};e.innerHTML=`
    <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,500px)_minmax(0,1fr)]">
      <div class="min-w-0 space-y-5">
        <section class="card">
          <div class="card-header">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500/10 text-accent-300">${l(`sparkles`,`h-4 w-4`)}</span>
              <div>
                <h2 class="card-title">Workflow</h2>
                <p class="card-subtitle" data-workflow-summary>Loading…</p>
              </div>
            </div>
            <span class="chip" data-kind-chip>—</span>
          </div>
          <div class="space-y-3 p-4 sm:p-5">
            ${c.length?`<select class="select" data-workflow-select aria-label="Workflow">
                    ${c.map(e=>`<option value="${o(e.name)}">${o(e.label)}</option>`).join(``)}
                  </select>`:`<div class="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">No workflows were found in the <code class="font-mono">workflows/</code> folder.</div>`}
            <div class="flex flex-wrap gap-2">
              <button class="btn-secondary btn-xs" data-choose-inputs>${l(`settings`,`h-4 w-4`)} Choose inputs</button>
              <button class="btn-ghost btn-xs" data-reload-workflow>${l(`refresh`,`h-4 w-4`)} Refresh</button>
            </div>
          </div>
        </section>

        <section class="card hidden" data-presets-card></section>

        <section class="card hidden" data-inputs-card></section>

        <section class="card hidden" data-notes-card></section>

        <section class="card">
          <div class="card-header">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300">${l(`settings`,`h-4 w-4`)}</span>
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
              <button class="btn-primary min-w-[9rem] flex-1" data-generate>${l(`play`,`h-4 w-4`)} Generate</button>
              <button class="btn-danger min-w-[7rem] flex-1" data-stop disabled>${l(`stop`,`h-4 w-4`)} Stop</button>
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
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">${l(`image`,`h-4 w-4`)}</span>
              <div>
                <h2 class="card-title">Output</h2>
                <p class="card-subtitle" data-result-subtitle>Nothing generated yet.</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="chip hidden" data-result-time title="Generation time"></span>
              <a class="btn-ghost btn-xs hidden" data-result-open target="_blank" rel="noopener noreferrer">${l(`external`,`h-4 w-4`)} Open</a>
            </div>
          </div>
          <div class="p-4 sm:p-5" data-result></div>
        </section>
      </div>
    </div>
  `;let E=t=>y(e,t),D=e.querySelector(`[data-workflow-select]`),P=E(`[data-presets-card]`),F=E(`[data-inputs-card]`),I=E(`[data-notes-card]`),L=E(`[data-controls]`),B=E(`[data-result]`),V=E(`[data-generate]`),U=E(`[data-stop]`),ne=E(`[data-progress-wrap]`),ae=E(`[data-progress-bar]`),W=E(`[data-progress-label]`),oe=E(`[data-progress-percent]`),se=E(`[data-progress-time]`),ce=E(`[data-result-time]`),le=E(`[data-result-open]`);D&&(D.value=p||``);function ue(e,t,n=!1){if(ne.classList.remove(`hidden`),W.textContent=typeof t==`string`?t:``,n)ae.classList.add(`animate-pulse`),ae.style.width=`38%`,ae.style.transform=`translateX(0)`,oe.textContent=``;else{ae.classList.remove(`animate-pulse`),ae.style.transform=`none`;let t=Number(e)||0,n=Math.round(Math.max(0,Math.min(1,t))*100);ae.style.width=`${n}%`,oe.textContent=`${n}%`}}function de(){ne.classList.add(`hidden`),ae.style.width=`0%`,oe.textContent=``,se.textContent=``}function G(e){let t=Math.max(0,e)/1e3;if(t<60)return`${t.toFixed(1)}s`;let n=Math.floor(t/60),r=Math.floor(t%60);return`${n}m ${String(r).padStart(2,`0`)}s`}function fe(e){if(!ce)return;if(!e){ce.classList.add(`hidden`),ce.textContent=``;return}let t=G(e);ce.innerHTML=`${l(`clock`,`h-3 w-3`)} ${t}`,ce.title=`Generation time: ${t}`,ce.classList.remove(`hidden`)}function pe(){T.timer||=setInterval(()=>{N.running&&(se.textContent=G(te()))},200),se.textContent=G(te())}function me(){T.timer&&=(clearInterval(T.timer),null)}let K=``;function he(e){let t=!!p&&e.workflow===p,n=t?e.result:null,r=t?e.error:``;T.running=e.running,T.result=n,T.error=r,T.elapsedMs=e.elapsedMs;let i=[e.running,r,n?.url||``,n?.kind||``].join(`|`);i!==K&&(K=i,Ne(),q());let a=!e.running&&e.doneAt&&e.progress?.message===`Done.`&&performance.now()-e.doneAt<1400;e.running?(ue(e.progress?.value,e.progress?.message,!!e.progress?.indeterminate),pe()):a?(ue(1,`Done.`,!1),me(),se.textContent=G(e.elapsedMs),setTimeout(()=>{N.running||de()},Math.max(0,1400-(performance.now()-e.doneAt)))):(me(),de())}function q(){if(T.error){le.classList.add(`hidden`),fe(0),E(`[data-result-subtitle]`).textContent=T.elapsedMs?`${T.error===`Generation cancelled.`?`Cancelled`:`Generation failed`} after ${G(T.elapsedMs)}.`:`Generation failed.`,B.innerHTML=`
        <div class="rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-5">
          <div class="flex items-start gap-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">${l(`alert`,`h-5 w-5`)}</span>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-rose-100">Generation failed</p>
              <p class="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-rose-200/80">${o(T.error)}</p>
            </div>
          </div>
        </div>
      `;return}if(T.running){le.classList.add(`hidden`),fe(0),E(`[data-result-subtitle]`).textContent=`Working…`,B.innerHTML=`
        <div class="flex min-h-[22rem] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-subtle bg-white/[0.015]">
          <div class="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-accent-400/20 bg-accent-500/10 text-accent-300">
            ${u(`h-7 w-7`)}
          </div>
          <div class="text-center">
            <p class="text-sm font-medium text-slate-200">Generating</p>
            <p class="mt-1 text-xs text-slate-500">The result will appear here when ComfyUI finishes.</p>
          </div>
        </div>
      `;return}if(!T.result){le.classList.add(`hidden`),fe(0),E(`[data-result-subtitle]`).textContent=`Nothing generated yet.`,B.innerHTML=b(`Ready when you are`,`Set your inputs, then press Generate. Results stay available here until you start another run.`,`sparkles`);return}let e=T.result;fe(T.elapsedMs),E(`[data-result-subtitle]`).textContent=e.filename||`Generated result`,le.href=e.url||``,le.classList.remove(`hidden`),e.kind===`image`?B.innerHTML=`
        <a href="${o(e.url)}" target="_blank" rel="noopener noreferrer" class="group relative block overflow-hidden rounded-2xl border border-subtle bg-ink-950">
          <img src="${o(e.url)}" alt="${o(e.filename||`Generated image`)}" class="max-h-[72vh] w-full object-contain transition duration-300 group-hover:scale-[1.005]" />
          <span class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent p-3 text-[11px] text-white/70 opacity-0 transition group-hover:opacity-100">
            <span class="truncate">${o(e.filename||``)}</span>
            <span class="inline-flex items-center gap-1">Open full size ${l(`external`,`h-3.5 w-3.5`)}</span>
          </span>
        </a>
      `:e.kind===`audio`?B.innerHTML=`
        <div class="rounded-2xl border border-subtle bg-raised p-5">
          <div class="mb-4 flex items-center gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">${l(`music`,`h-5 w-5`)}</span>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-slate-200">${o(e.filename||`Generated audio`)}</p>
              <p class="text-xs text-slate-500">Audio result</p>
            </div>
          </div>
          <audio class="w-full" controls src="${o(e.url)}"></audio>
        </div>
      `:B.innerHTML=`
        <div class="overflow-hidden rounded-2xl border border-subtle bg-ink-950">
          <video class="max-h-[72vh] w-full" controls playsinline src="${o(e.url)}"></video>
          <div class="flex items-center justify-between gap-3 border-t border-subtle px-4 py-3">
            <p class="truncate text-xs text-slate-400">${o(e.filename||`Generated video`)}</p>
            <a class="btn-ghost btn-xs" href="${o(e.url)}" download>${l(`download`,`h-4 w-4`)} Download</a>
          </div>
        </div>
      `}function ge(){if(!d)return;let e=d.selected.length;E(`[data-workflow-summary]`).textContent=`${e} input${e===1?``:`s`} · ${d.saved_selection?`custom selection`:`all inputs`}`;let t=E(`[data-kind-chip]`);t.textContent=k[d.kind]||`Image`,t.className=`chip ${d.kind===`audio`?`chip-warn`:d.kind===`video`?`chip-success`:``}`}function J(){d?(I.classList.remove(`hidden`),I.innerHTML=`
      <div class="card-header">
        <button type="button" class="flex min-w-0 flex-1 items-center gap-2.5 text-left" data-notes-toggle aria-expanded="${C?`false`:`true`}" aria-controls="workflow-notes-body">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300">${l(`info`,`h-4 w-4`)}</span>
          <span class="min-w-0">
            <span class="card-title block">Workflow notes</span>
            <span class="card-subtitle block">Tips saved for this workflow</span>
          </span>
          <span class="ml-auto shrink-0 text-slate-500 transition-transform ${C?``:`rotate-180`}" data-notes-chevron>${l(`chevron`,`h-4 w-4`)}</span>
        </button>
        <button class="btn-ghost btn-xs" data-edit-notes>${l(`pencil`,`h-4 w-4`)} Edit</button>
      </div>
      <div id="workflow-notes-body" data-notes-body class="${C?`hidden`:``}">
        ${d.notes?`<div class="prose-notes p-4 sm:p-5">${f(d.notes)}</div>`:`<p class="p-4 text-sm text-slate-500 sm:p-5">No notes for this workflow yet. Use Edit to add tips.</p>`}
      </div>
    `,I.querySelector(`[data-edit-notes]`)?.addEventListener(`click`,je),I.querySelector(`[data-notes-toggle]`)?.addEventListener(`click`,()=>{C=!C,I.querySelector(`[data-notes-body]`)?.classList.toggle(`hidden`,C);let e=I.querySelector(`[data-notes-toggle]`);e?.setAttribute(`aria-expanded`,String(!C)),e?.querySelector(`[data-notes-chevron]`)?.classList.toggle(`rotate-180`,!C)})):(I.classList.add(`hidden`),I.innerHTML=``)}function _e(){if(!d)return;let e=d;P.classList.remove(`hidden`);let n=e.preset_names||[];S&&n.includes(S)||(S=e.default_preset||n[0]||``),P.innerHTML=`
      <details class="group" ${n.length?``:`open`}>
        <summary class="card-header cursor-pointer list-none select-none">
          <div class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">${l(`save`,`h-4 w-4`)}</span>
            <div>
              <h2 class="card-title">Input presets</h2>
              <p class="card-subtitle">${n.length?`${n.length} saved preset${n.length===1?``:`s`}`:`Save your current values for later`}</p>
            </div>
          </div>
          <span class="text-slate-500 transition group-open:rotate-180">${l(`chevron`,`h-4 w-4`)}</span>
        </summary>
        <div class="space-y-3 border-t border-subtle p-4 sm:p-5">
          <div class="flex gap-2">
            <select class="select min-w-0 flex-1" data-preset-select aria-label="Saved preset">
              ${n.length?n.map(t=>`<option value="${o(t)}" ${t===S?`selected`:``}>${o(t)}${t===e.default_preset?` (default)`:``}</option>`).join(``):`<option value="">No presets yet</option>`}
            </select>
            <button class="btn-secondary btn-xs shrink-0" data-preset-load ${n.length?``:`disabled`}>Load</button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn-ghost btn-xs" data-preset-default ${n.length?``:`disabled`}>${l(`check`,`h-4 w-4`)} Set default</button>
            <button class="btn-ghost btn-xs text-rose-300 hover:bg-rose-500/10" data-preset-delete ${n.length?``:`disabled`}>${l(`trash`,`h-4 w-4`)} Delete</button>
          </div>
          <div class="flex gap-2 border-t border-subtle pt-3">
            <input class="input min-w-0 flex-1" data-preset-name placeholder="New preset name, e.g. High quality" />
            <button class="btn-primary btn-xs shrink-0" data-preset-save>${l(`save`,`h-4 w-4`)} Save</button>
          </div>
          <p class="text-[11px] leading-5 text-slate-500">Leave the name blank to overwrite the selected preset.</p>
        </div>
      </details>
    `;let i=P.querySelector(`[data-preset-select]`);i?.addEventListener(`change`,()=>{S=i.value}),P.querySelector(`[data-preset-load]`)?.addEventListener(`click`,()=>{if(!d||!S){m(`Choose a preset first.`,`warning`);return}let e=d.presets[S];if(!e)m(`Choose a preset first.`,`warning`);else{for(let t of d.candidates)Object.prototype.hasOwnProperty.call(e,t.id)&&(T.values[t.id]=e[t.id]);ke(),m(`Loaded preset “${S}”.`,`success`)}}),P.querySelector(`[data-preset-save]`)?.addEventListener(`click`,async e=>{let n=P.querySelector(`[data-preset-name]`)?.value.trim()||S;if(!n||!d){m(`Type a preset name first.`,`warning`);return}let i=e.currentTarget;_(i,!0,`Saving…`);try{let e=await r(`${A(d.name)}/presets`,{method:`POST`,body:{name:n,values:ee(d,T.values)}});S=n,Me(e,{preserve:!0}),m(`Saved preset “${n}”.`,`success`)}catch(e){m(t(e),`error`)}finally{_(i,!1)}}),P.querySelector(`[data-preset-default]`)?.addEventListener(`click`,async()=>{if(S&&d)try{Me(await r(`${A(d.name)}/presets/default`,{method:`POST`,body:{name:S}}),{preserve:!0}),m(`“${S}” will load automatically.`,`success`)}catch(e){m(t(e),`error`)}}),P.querySelector(`[data-preset-delete]`)?.addEventListener(`click`,async()=>{if(S&&d&&await g(`Delete the preset “${S}”?`,{title:`Delete preset`,confirmLabel:`Delete`,danger:!0}))try{let e=await r(`${A(d.name)}/presets/delete`,{method:`POST`,body:{name:S}});S=e.default_preset||e.preset_names[0]||``,Me(e,{preserve:!0}),m(`Preset deleted.`,`success`)}catch(e){m(t(e),`error`)}})}function Y(){if(!d)return;let e=d,t=e.image_nodes.length>0,n=e.audio_nodes.length>0,r=e.video_nodes.length>0;if(!t&&!n&&!r){F.classList.add(`hidden`),F.innerHTML=``;return}F.classList.remove(`hidden`);let i=[];t&&i.push(`
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Input images</h3>
            <span class="text-[11px] text-slate-600">Upload, crop, sketch or pick from the gallery</span>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            ${e.image_nodes.map((e,t)=>ve(e,t)).join(``)}
          </div>
        </div>
      `),n&&i.push(`
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Reference audio</h3>
            <span class="text-[11px] text-slate-600">${o(e.audio_nodes[0]?.label)}</span>
          </div>
          ${ye()}
        </div>
      `),r&&i.push(`
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Input video</h3>
            <span class="text-[11px] text-slate-600">${o(e.video_nodes[0]?.label)}</span>
          </div>
          ${be()}
        </div>
      `),F.innerHTML=`
      <div class="card-header">
        <div class="flex items-center gap-2.5">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300">${l(`image`,`h-4 w-4`)}</span>
          <div>
            <h2 class="card-title">Inputs</h2>
            <p class="card-subtitle">Files are uploaded to ComfyUI when you generate.</p>
          </div>
        </div>
      </div>
      <div class="space-y-5 p-4 sm:p-5">${i.join(``)}</div>
    `,e.image_nodes.forEach((e,t)=>{let n=F.querySelector(`[data-image-slot="${t}"]`);n&&(n.querySelector(`[data-image-upload]`)?.addEventListener(`change`,e=>{let n=e.target.files?.[0];n&&xe(n,t)}),n.querySelector(`[data-image-sketch]`)?.addEventListener(`click`,()=>Ee(t)),n.querySelector(`[data-image-crop]`)?.addEventListener(`click`,()=>De(t)),n.querySelector(`[data-image-gallery]`)?.addEventListener(`click`,()=>Ce(t)),n.querySelector(`[data-image-clear]`)?.addEventListener(`click`,()=>{T.images[t]=null,Y()}))}),F.querySelector(`[data-audio-upload]`)?.addEventListener(`change`,e=>{let t=e.target,n=t.files?.[0];t.value=``,n&&X(n)}),F.querySelector(`[data-audio-trim]`)?.addEventListener(`click`,Z),F.querySelector(`[data-audio-gallery]`)?.addEventListener(`click`,Te),F.querySelector(`[data-audio-clear]`)?.addEventListener(`click`,()=>{T.audio=null,Y()}),F.querySelector(`[data-video-upload]`)?.addEventListener(`change`,e=>{let t=e.target.files?.[0];t&&Se(t,e=>{T.video=e},`Video`)}),F.querySelector(`[data-video-gallery]`)?.addEventListener(`click`,we),F.querySelector(`[data-video-clear]`)?.addEventListener(`click`,()=>{T.video=null,Y()})}function ve(e,t){let n=T.images[t],r=n?`<img src="${o(n.previewUrl)}" alt="${o(e.label)}" class="h-full w-full object-contain" />`:`<div class="flex h-full flex-col items-center justify-center gap-2 text-slate-600">
           ${l(`image`,`h-7 w-7`)}
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
            ${l(`upload`,`h-3.5 w-3.5`)} Upload
            <input type="file" accept="image/*" class="sr-only" data-image-upload />
          </label>
          <button class="btn-ghost btn-xs" data-image-sketch>${l(`pencil`,`h-3.5 w-3.5`)} Sketch</button>
          ${n?`<button class="btn-ghost btn-xs" data-image-crop>${l(`crop`,`h-3.5 w-3.5`)} Crop</button>`:``}
          <button class="btn-ghost btn-xs" data-image-gallery>${l(`gallery`,`h-3.5 w-3.5`)} Gallery</button>
          ${n?`<button class="btn-ghost btn-xs text-rose-300 hover:bg-rose-500/10" data-image-clear>${l(`trash`,`h-3.5 w-3.5`)}</button>`:``}
        </div>
      </div>
    `}function ye(){let e=T.audio;return`
      <div class="rounded-xl border border-subtle bg-raised p-3">
        ${e?`<audio class="mb-3 w-full" controls src="${o(e.previewUrl)}"></audio>`:``}
        <div class="flex flex-wrap items-center gap-2">
          <label class="btn-secondary btn-xs cursor-pointer">
            ${l(`upload`,`h-3.5 w-3.5`)} ${e?`Replace audio`:`Upload audio`}
            <input type="file" accept="audio/*" class="sr-only" data-audio-upload />
          </label>
          <button class="btn-ghost btn-xs" data-audio-gallery>${l(`gallery`,`h-3.5 w-3.5`)} Gallery</button>
          ${e?`<button class="btn-ghost btn-xs" data-audio-trim>${l(`scissors`,`h-3.5 w-3.5`)} Trim</button>`:``}
          ${e?`<span class="min-w-0 flex-1 truncate text-[11px] text-slate-500">${o(e.name||`Audio selected`)}</span>`:`<span class="text-[11px] text-slate-600">No reference audio selected</span>`}
          ${e?`<button class="btn-ghost btn-xs text-rose-300 hover:bg-rose-500/10" data-audio-clear>${l(`trash`,`h-3.5 w-3.5`)}</button>`:``}
        </div>
      </div>
    `}function be(){let e=T.video;return`
      <div class="rounded-xl border border-subtle bg-raised p-3">
        ${e?`<video class="mb-3 max-h-64 w-full rounded-lg bg-ink-950" controls src="${o(e.previewUrl)}"></video>`:`<div class="mb-3 flex aspect-video items-center justify-center rounded-lg border border-dashed border-subtle bg-ink-950/60 text-slate-600">${l(`film`,`h-7 w-7`)}</div>`}
        <div class="flex flex-wrap items-center gap-2">
          <label class="btn-secondary btn-xs cursor-pointer">
            ${l(`upload`,`h-3.5 w-3.5`)} ${e?`Replace video`:`Upload video`}
            <input type="file" accept="video/*" class="sr-only" data-video-upload />
          </label>
          <button class="btn-ghost btn-xs" data-video-gallery>${l(`gallery`,`h-3.5 w-3.5`)} Gallery</button>
          ${e?`<span class="min-w-0 flex-1 truncate text-[11px] text-slate-500">${o(e.name||`Video selected`)}</span>`:``}
          ${e?`<button class="btn-ghost btn-xs text-rose-300 hover:bg-rose-500/10" data-video-clear>${l(`trash`,`h-3.5 w-3.5`)}</button>`:``}
        </div>
      </div>
    `}async function xe(e,n){try{m(`Uploading image…`,`info`,1500);let t=await i(e);T.images[n]={upload:t.id,previewUrl:t.url,name:t.name},Y(),m(`Image ready.`,`success`,1600)}catch(e){m(t(e),`error`)}}async function Se(e,n,r){try{m(`Uploading ${r.toLowerCase()}…`,`info`,1500);let t=await i(e);n({upload:t.id,previewUrl:t.url,name:t.name}),Y(),m(`${r} ready.`,`success`,1600)}catch(e){m(t(e),`error`)}}function X(e){O({source:e,name:e.name||`audio`,title:`Trim reference audio`,subtitle:`Choose the part of the clip to keep before uploading. Trimmed selections are saved as WAV.`,onApply:e=>Q(e)})}function Z(){let e=T.audio;e?.previewUrl?O({source:e.previewUrl,name:e.name||`audio`,title:`Trim reference audio`,subtitle:`Choose the part of the clip to keep.`,onApply:e=>Q(e)}):m(`Choose an audio file first.`,`warning`)}async function Q(e){let t=await i(e);T.audio={upload:t.id,previewUrl:t.url,name:t.name||e.name},Y(),m(`Audio ready.`,`success`,1600)}function $(e,t){let n=s(t);return`<div class="px-2.5 py-2">
      <p class="truncate text-[11px] text-slate-400">${o(e)}</p>
      ${n?`<p class="mt-0.5 truncate text-[10px] text-slate-500">${n}</p>`:``}
    </div>`}async function Ce(e){let n=h({title:`Choose an image`,subtitle:`Reuse a recent image from ComfyUI or the media folder.`,size:`lg`,content:`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">${Array.from({length:8}).map(()=>`<div class="skeleton aspect-square"></div>`).join(``)}</div>`});try{let t=await r(`/api/gallery/images?limit=60`);if(!t.items.length){n.body.innerHTML=b(`No images yet`,`Generate an image first, add one to the media folder, or upload one in the image editor.`,`image`);return}n.body.innerHTML=`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        ${t.items.map((e,t)=>`
            <button class="group overflow-hidden rounded-xl border border-subtle bg-raised text-left transition hover:border-accent-400/40 hover:bg-raised" data-gallery-item="${t}">
              <div class="aspect-square overflow-hidden bg-ink-950">
                <img src="${o(e.thumbnail_url||e.url)}" data-full-src="${o(e.url)}" alt="${o(e.filename)}" loading="lazy" class="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
              </div>
              ${$(e.filename,e.created_at)}
            </button>
          `).join(``)}
      </div>`,n.body.querySelectorAll(`[data-gallery-item]`).forEach(r=>{r.addEventListener(`click`,()=>{let i=t.items[Number(r.dataset.galleryItem)];T.images[e]={gallery:i,previewUrl:i.url,name:i.filename},n.close(),Y(),m(`Gallery image selected.`,`success`,1600)})}),n.body.querySelectorAll(`img[data-full-src]`).forEach(e=>{e.addEventListener(`error`,()=>{let t=e.dataset.fullSrc;t&&e.getAttribute(`src`)!==t?e.src=t:e.hidden=!0})})}catch(e){n.body.innerHTML=`<p class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">${o(t(e))}</p>`}}async function we(){let e=h({title:`Choose a video`,subtitle:`Reuse a recent video from ComfyUI or the media folder.`,size:`lg`,content:`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">${Array.from({length:8}).map(()=>`<div class="skeleton aspect-square"></div>`).join(``)}</div>`});try{let t=await r(`/api/gallery/videos?limit=60`);if(!t.items.length){e.body.innerHTML=b(`No videos yet`,`Generate or upscale a video first, add one to the media folder, or upload one above.`,`film`);return}e.body.innerHTML=`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        ${t.items.map((e,t)=>`
            <button class="group overflow-hidden rounded-xl border border-subtle bg-raised text-left transition hover:border-accent-400/40 hover:bg-raised" data-video-item="${t}">
              <div class="relative aspect-square overflow-hidden bg-ink-950">
                <span class="absolute inset-0 flex items-center justify-center text-slate-600">${l(`film`,`h-7 w-7`)}</span>
                ${e.thumbnail_url?`<img src="${o(e.thumbnail_url)}" data-thumbnail alt="${o(e.filename)}" loading="lazy" class="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105" />`:``}
                <span class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/25">
                  <span class="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white">
                    ${l(`play`,`h-5 w-5`)}
                  </span>
                </span>
              </div>
              ${$(e.filename,e.created_at)}
            </button>
          `).join(``)}
      </div>`,e.body.querySelectorAll(`[data-video-item]`).forEach(n=>{n.addEventListener(`click`,()=>{let r=t.items[Number(n.dataset.videoItem)];T.video={gallery:r,previewUrl:r.url,name:r.filename},e.close(),Y(),m(`Gallery video selected.`,`success`,1600)})}),e.body.querySelectorAll(`img[data-thumbnail]`).forEach(e=>{e.addEventListener(`error`,()=>e.remove())})}catch(n){e.body.innerHTML=`<p class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">${o(t(n))}</p>`}}async function Te(){let e=h({title:`Choose audio`,subtitle:`Reuse a recent audio clip from ComfyUI or the media folder.`,size:`lg`,content:`<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">${Array.from({length:6}).map(()=>`<div class="skeleton h-32"></div>`).join(``)}</div>`});try{let t=await r(`/api/gallery/audio?limit=60`);if(!t.items.length){e.body.innerHTML=b(`No audio yet`,`Generate audio first, add a clip to the media folder, or upload one above.`,`music`);return}e.body.innerHTML=`<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        ${t.items.map((e,t)=>`
            <div class="rounded-xl border border-subtle bg-raised p-3">
              <div class="mb-2 flex items-center gap-2">
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">${l(`music`,`h-4 w-4`)}</span>
                <div class="min-w-0">
                  <p class="truncate text-xs font-semibold text-slate-200">${o(e.filename)}</p>
                  ${e.prompt?`<p class="truncate text-[11px] text-slate-500">${o(e.prompt)}</p>`:``}
                  ${e.created_at?`<p class="truncate text-[10px] text-slate-500">${s(e.created_at)}</p>`:``}
                </div>
              </div>
              <audio class="mb-2 w-full" controls preload="none" src="${o(e.url)}"></audio>
              <button class="btn-secondary btn-xs w-full" data-audio-item="${t}">${l(`check`,`h-3.5 w-3.5`)} Use this audio</button>
            </div>
          `).join(``)}
      </div>`,e.body.querySelectorAll(`[data-audio-item]`).forEach(n=>{n.addEventListener(`click`,()=>{let r=t.items[Number(n.dataset.audioItem)];T.audio={gallery:r,previewUrl:r.url,name:r.filename},e.close(),Y(),m(`Gallery audio selected.`,`success`,1600)})})}catch(n){e.body.innerHTML=`<p class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">${o(t(n))}</p>`}}function Ee(e){let n=T.images[e],r=h({title:`Sketch an input image`,subtitle:`Draw directly on the canvas. The result is uploaded when you apply it.`,size:`lg`,content:`
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
            <button class="btn-ghost btn-xs ml-auto" data-sketch-clear>${l(`trash`,`h-4 w-4`)} Clear</button>
          </div>
          <div class="flex items-center justify-center overflow-hidden rounded-xl border border-subtle bg-ink-950 p-2">
            <canvas class="max-h-[62vh] max-w-full touch-none rounded-lg bg-white" data-sketch-canvas></canvas>
          </div>
        </div>
      `,footer:`
        <div class="flex w-full items-center justify-end gap-2">
          <button class="btn-secondary" data-sketch-cancel>Cancel</button>
          <button class="btn-primary" data-sketch-apply>${l(`check`,`h-4 w-4`)} Use sketch</button>
        </div>
      `}),a=y(r.element,`[data-sketch-canvas]`),o=a.getContext(`2d`);if(!o)throw Error(`Canvas 2D is not available.`);let s=y(r.element,`[data-brush-color]`),c=y(r.element,`[data-brush-size]`),u=y(r.element,`[data-brush-label]`),d=!1,f=null,p=s.value,g=Number(c.value),v=(e=1024,t=1024)=>{a.width=e,a.height=t,o.fillStyle=`#ffffff`,o.fillRect(0,0,e,t)},b=()=>{o.strokeStyle=p,o.lineWidth=g,o.lineCap=`round`,o.lineJoin=`round`};if(n?.previewUrl){let e=new Image;e.onload=()=>{let t=Math.min(1,1024/Math.max(e.naturalWidth,e.naturalHeight));v(Math.max(1,Math.round(e.naturalWidth*t)),Math.max(1,Math.round(e.naturalHeight*t))),o.drawImage(e,0,0,a.width,a.height),b()},e.onerror=()=>{v(),b()},e.src=n.previewUrl}else v(),b();let x=e=>{let t=a.getBoundingClientRect();return{x:(e.clientX-t.left)/t.width*a.width,y:(e.clientY-t.top)/t.height*a.height}};a.addEventListener(`pointerdown`,e=>{d=!0,a.setPointerCapture(e.pointerId),f=x(e),b(),o.beginPath(),o.arc(f.x,f.y,g/2,0,Math.PI*2),o.fillStyle=p,o.fill()}),a.addEventListener(`pointermove`,e=>{if(!d||!f)return;let t=x(e);b(),o.beginPath(),o.moveTo(f.x,f.y),o.lineTo(t.x,t.y),o.stroke(),f=t});let S=()=>{d=!1,f=null};a.addEventListener(`pointerup`,S),a.addEventListener(`pointercancel`,S),a.addEventListener(`pointerleave`,S),s.addEventListener(`input`,()=>{p=s.value}),c.addEventListener(`input`,()=>{g=Number(c.value),u.textContent=String(g)}),r.element.querySelector(`[data-sketch-clear]`)?.addEventListener(`click`,()=>{o.fillStyle=`#ffffff`,o.fillRect(0,0,a.width,a.height)}),r.element.querySelector(`[data-sketch-cancel]`)?.addEventListener(`click`,()=>r.close()),r.element.querySelector(`[data-sketch-apply]`)?.addEventListener(`click`,n=>{let o=n.currentTarget;_(o,!0,`Uploading…`),a.toBlob(async n=>{if(!n)_(o,!1),m(`Could not export the sketch.`,`error`);else try{let t=await i(new File([n],`sketch.png`,{type:`image/png`}));T.images[e]={upload:t.id,previewUrl:t.url,name:`sketch.png`},r.close(),Y(),m(`Sketch applied.`,`success`)}catch(e){m(t(e),`error`),_(o,!1)}},`image/png`)})}function De(e){let n=T.images[e];if(!n?.previewUrl){m(`Choose an image first.`,`warning`);return}let r=null,a=h({title:`Crop an input image`,subtitle:`Drag the box to move it, or its handles to resize. Dimensions are rounded to multiples of 8.`,size:`lg`,onClose:()=>{r&&window.removeEventListener(`resize`,r)},content:`
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
          <button class="btn-primary" data-crop-apply>${l(`check`,`h-4 w-4`)} Use crop</button>
        </div>
      `}),s=y(a.element,`[data-crop-image]`),c=y(a.element,`[data-crop-box]`),u=y(a.element,`[data-crop-size]`),d=y(a.element,`[data-crop-apply]`),f={n:y(a.element,`[data-shade="n"]`),s:y(a.element,`[data-shade="s"]`),w:y(a.element,`[data-shade="w"]`),e:y(a.element,`[data-shade="e"]`)},p=null,g=null,b=()=>{let e=s.getBoundingClientRect();return{width:e.width,height:e.height}},x=(e,t)=>({width:Math.min(.5,24/Math.max(1,e)),height:Math.min(.5,24/Math.max(1,t))});function S(){if(!p||!s.naturalWidth||!s.naturalHeight)return null;let e=s.naturalWidth,t=s.naturalHeight,n=v(Math.round(p.width*e/8)*8,8,e),r=v(Math.round(p.height*t/8)*8,8,t);return{x:v(Math.round(p.x*e),0,e-n),y:v(Math.round(p.y*t),0,t-r),width:n,height:r}}function C(){if(!p)return;let e=p.x*100,t=p.y*100,n=p.width*100,r=p.height*100;c.style.left=`${e}%`,c.style.top=`${t}%`,c.style.width=`${n}%`,c.style.height=`${r}%`,Object.assign(f.n.style,{left:`0%`,top:`0%`,width:`100%`,height:`${t}%`}),Object.assign(f.s.style,{left:`0%`,top:`${t+r}%`,width:`100%`,bottom:`0`}),Object.assign(f.w.style,{left:`0%`,top:`${t}%`,width:`${e}%`,height:`${r}%`}),Object.assign(f.e.style,{left:`${e+n}%`,top:`${t}%`,right:`0`,height:`${r}%`});let i=S();i&&u&&(u.textContent=`${i.width} × ${i.height}`)}function w(){let{width:e,height:t}=b();if(!e||!t)return;let n=Math.min(e,t)*.8;p={x:(e-n)/2/e,y:(t-n)/2/t,width:n/e,height:n/t},C()}function E(e,t,n,r){let{width:i,height:a}=b();if(!i||!a)return t;let o=x(i,a),s={...t},c=n/i,l=r/a;if(e===`move`)return s.x=v(t.x+c,0,1-t.width),s.y=v(t.y+l,0,1-t.height),s;let u=t.x,d=t.y,f=t.x+t.width,p=t.y+t.height;return e.includes(`w`)&&(u=v(u+c,0,Math.max(0,f-o.width))),e.includes(`e`)&&(f=v(f+c,Math.min(1,u+o.width),1)),e.includes(`n`)&&(d=v(d+l,0,Math.max(0,p-o.height))),e.includes(`s`)&&(p=v(p+l,Math.min(1,d+o.height),1)),s.x=u,s.y=d,s.width=f-u,s.height=p-d,s}c.querySelectorAll(`[data-handle]`).forEach(e=>{e.addEventListener(`pointerdown`,t=>{p&&(t.preventDefault(),t.stopPropagation(),e.setPointerCapture(t.pointerId),g={mode:e.dataset.handle||``,pointerId:t.pointerId,startX:t.clientX,startY:t.clientY,selection:{...p}})}),e.addEventListener(`pointermove`,e=>{g&&g.pointerId===e.pointerId&&(p=E(g.mode,g.selection,e.clientX-g.startX,e.clientY-g.startY),C())});let t=e=>{g&&g.pointerId===e.pointerId&&(g=null)};e.addEventListener(`pointerup`,t),e.addEventListener(`pointercancel`,t)}),r=()=>C(),window.addEventListener(`resize`,r);let D=()=>{requestAnimationFrame(w)};s.complete&&s.naturalWidth>0?D():s.addEventListener(`load`,D,{once:!0}),s.addEventListener(`error`,()=>{u.textContent=`Image unavailable`,d.disabled=!0}),a.element.querySelector(`[data-crop-cancel]`)?.addEventListener(`click`,()=>a.close());let O=/\.(jpe?g)$/i.test(n.name||``)?`image/jpeg`:`image/png`;d.addEventListener(`click`,()=>{let n=S();if(!n){m(`The image is still loading.`,`warning`);return}_(d,!0,`Cropping…`);let r=document.createElement(`canvas`);r.width=n.width,r.height=n.height;let o=r.getContext(`2d`);o?(o.drawImage(s,n.x,n.y,n.width,n.height,0,0,n.width,n.height),r.toBlob(async n=>{if(!n){_(d,!1),m(`Could not export the crop.`,`error`);return}let r=O===`image/jpeg`?`jpg`:`png`;try{let t=await i(new File([n],`crop.${r}`,{type:O}));T.images[e]={upload:t.id,previewUrl:t.url,name:t.name||`crop.${r}`},a.close(),Y(),m(`Crop applied.`,`success`)}catch(e){m(t(e),`error`),_(d,!1)}},O,O===`image/jpeg`?.92:void 0)):(_(d,!1),m(`Could not crop the image.`,`error`))})}function Oe(e,t){let n=e.field_def||{},r=n.widget||`textbox`,i=n.options||{},a=o(e.id),s=o(e.display_name||e.title||e.class_type),c=`<span class="font-mono text-[10px] text-slate-600">${o(e.node)} · ${o(e.input)}</span>`;if(r===`textbox`)return`
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
    `}function ke(){if(!d)return;let e=d,t=new Map(e.candidates.map(e=>[e.id,e])),n=e.selected.map(e=>t.get(e)).filter(e=>!!e),r=e.candidates.some(e=>/(^|_)(noise_)?seed$/.test(e.input))?`<label class="flex items-center justify-between gap-3 rounded-xl border border-subtle bg-raised px-3 py-2.5">
           <span><span class="block text-sm font-medium text-slate-200">Randomize seed</span><span class="text-[11px] text-slate-500">Use a fresh seed on every run</span></span>
           <span class="switch"><input type="checkbox" ${x?`checked`:``} data-randomize /><span></span></span>
         </label>`:``,i=()=>{L.querySelector(`[data-randomize]`)?.addEventListener(`change`,e=>{x=e.target.checked})};if(E(`[data-controls-summary]`).textContent=`${n.length} control${n.length===1?``:`s`} shown`,!n.length)L.innerHTML=`
        ${b(`No inputs selected`,`Use Choose inputs to pick which workflow parameters appear here.`,`settings`)}
        <div class="mt-4 flex justify-center"><button class="btn-secondary btn-xs" data-empty-choose>Choose inputs</button></div>
        ${r?`<div class="mt-4">${r}</div>`:``}
      `,L.querySelector(`[data-empty-choose]`)?.addEventListener(`click`,Ae),i();else{for(let e of n)e.id in T.values&&T.values[e.id]!==void 0||(T.values[e.id]=e.value);L.innerHTML=`
      <div class="space-y-4">
        ${n.map(e=>Oe(e,T.values[e.id])).join(``)}
      </div>
      ${r?`<div class="mt-4">${r}</div>`:``}
    `,L.querySelectorAll(`[data-binding]`).forEach(t=>{let n=t.dataset.binding;if(!n)return;let r=e.candidates.find(e=>e.id===n)?.field_def?.widget,i=()=>{if(t.type===`checkbox`)return t.checked;if(t.type===`number`||t.type===`range`){let e=Number(t.value);return Number.isFinite(e)?e:t.value}return t.value},a=()=>{if(T.values[n]=i(),t.dataset.range!==void 0){let e=t.closest(`[data-control]`)?.querySelector(`[data-range-number]`);e&&(e.value=t.value)}};if(t.addEventListener(`input`,a),t.addEventListener(`change`,a),r===`slider`&&t.dataset.range!==void 0){let e=t.closest(`[data-control]`)?.querySelector(`[data-range-number]`);e?.addEventListener(`input`,()=>{let r=Number(t.min),i=Number(t.max),a=Math.min(i,Math.max(r,Number(e.value)||r));t.value=String(a),T.values[n]=a})}}),i()}}function Ae(){if(!d)return;let e=d,n=e.candidates.map(t=>{let n=e.selected.indexOf(t.id);return{candidate:t,show:n>=0,order:n>=0?String(n+1):``,name:t.display_name||``}});n.sort((e,t)=>e.show===t.show?e.show&&t.show?Number(e.order)-Number(t.order):0:e.show?-1:1);let i=h({title:`Choose inputs`,subtitle:`Pick which node inputs are shown for ${e.name}. Drag-free ordering is set with the Order column.`,size:`lg`,content:`
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
          <button class="btn-primary" data-picker-save>${l(`check`,`h-4 w-4`)} Save selection</button>
        </div>
      `}),a=[...i.body.querySelectorAll(`[data-picker-row]`)],s=e=>{let t=n[e],r=a[e];if(!t||!r)return;let i=y(r,`[data-show]`),o=y(r,`[data-order]`);if(t.show=i.checked,t.show&&!o.value){let e=n.filter(e=>e.show&&e.order).map(e=>Number(e.order));o.value=String(e.length?Math.max(...e)+1:1)}t.order=o.value,o.disabled=!t.show,r.classList.toggle(`bg-accent-500/[0.035]`,t.show)};a.forEach((e,t)=>{e.querySelector(`[data-show]`)?.addEventListener(`change`,()=>s(t)),e.querySelector(`[data-order]`)?.addEventListener(`input`,e=>{let r=n[t];r&&(r.order=e.target.value)}),e.querySelector(`[data-name]`)?.addEventListener(`input`,e=>{let r=n[t];r&&(r.name=e.target.value)})}),i.body.querySelector(`[data-select-all]`)?.addEventListener(`click`,()=>{n.forEach((e,t)=>{if(!e.show){let e=a[t];if(!e)return;y(e,`[data-show]`).checked=!0,s(t)}})}),i.body.querySelector(`[data-select-none]`)?.addEventListener(`click`,()=>{n.forEach((e,t)=>{let n=a[t];n&&(y(n,`[data-show]`).checked=!1,s(t))})}),i.element.querySelector(`[data-picker-close]`)?.addEventListener(`click`,()=>i.close()),i.element.querySelector(`[data-picker-save]`)?.addEventListener(`click`,async a=>{let o=a.currentTarget;_(o,!0,`Saving…`);let s=n.filter(e=>e.show).sort((e,t)=>(e.order===``?1/0:Number(e.order))-(t.order===``?1/0:Number(t.order)));try{let t=await r(`${A(e.name)}/fields`,{method:`PUT`,body:{bindings:[...s.map(e=>({id:e.candidate.id,name:e.name.trim(),visible:!0})),...n.filter(e=>!e.show&&e.name.trim()).map(e=>({id:e.candidate.id,name:e.name.trim(),visible:!1}))]}});i.close(),Me(t,{preserve:!0}),m(`Input selection saved.`,`success`)}catch(e){m(t(e),`error`),_(o,!1)}})}function je(){if(!d)return;let e=d,n=h({title:`Workflow notes`,subtitle:`Markdown tips shown on the Generate page for ${e.name}.`,size:`lg`,content:`
        <textarea class="textarea font-mono text-xs" rows="14" data-notes placeholder="### Tips&#10;&#10;- Add workflow-specific tips here.">${o(e.notes||``)}</textarea>
      `,footer:`
        <div class="flex w-full flex-wrap items-center justify-end gap-2">
          <button class="btn-secondary" data-notes-cancel>Cancel</button>
          <button class="btn-primary" data-notes-save>${l(`check`,`h-4 w-4`)} Save notes</button>
        </div>
      `});n.element.querySelector(`[data-notes-cancel]`)?.addEventListener(`click`,()=>n.close()),n.element.querySelector(`[data-notes-save]`)?.addEventListener(`click`,async i=>{let a=i.currentTarget,o=y(n.body,`[data-notes]`).value;_(a,!0,`Saving…`);try{let t=await r(`${A(e.name)}/notes`,{method:`PUT`,body:{notes:o}});e.notes=t.notes,J(),n.close(),m(`Notes saved.`,`success`)}catch(e){m(t(e),`error`),_(a,!1)}})}function Me(e,{preserve:t=!1}={}){let n=T.values;d=e,p=e.name,D&&(D.value=p),t?(T.values={...e.values,...n},T.images=e.image_nodes.map((e,t)=>T.images[t]||null)):(T.values={...e.values},T.images=e.image_nodes.map(()=>null),T.audio=null,T.video=null,T.result=null,T.error=``,T.elapsedMs=0,N.running||de()),ge(),_e(),J(),Y(),ke(),q(),K=``,Ne()}function Ne(){D&&(D.disabled=T.running),V.disabled=T.running||!d,V.innerHTML=T.running?`${u(`h-4 w-4`)} Generating…`:`${l(`play`,`h-4 w-4`)} Generate`,U.disabled=!T.running}async function Pe(e,{preserve:n=!1}={}){if(!e)E(`[data-workflow-summary]`).textContent=`No workflow selected`;else try{E(`[data-workflow-summary]`).textContent=`Loading…`;let t=await r(A(e));Me(t,{preserve:n}),n||(S=t.default_preset||t.preset_names[0]||``)}catch(e){m(t(e),`error`),E(`[data-workflow-summary]`).textContent=`Could not load workflow`}}async function Fe(){d&&!N.running&&await ie({workflow:d.name,values:j(d,T.values),randomize_seed:x,images:d.image_nodes.map((e,t)=>M(T.images[t])),audio:M(T.audio),video:M(T.video)})}async function Ie(){if(N.running){N.progress={value:N.progress?.value??0,message:`Cancelling…`,indeterminate:!0},R();try{await r(`/api/generate/cancel`,{method:`POST`}),m(`Stopping generation…`,`warning`,2200),H(250)}catch(e){m(t(e),`error`)}}}return D?.addEventListener(`change`,()=>{S=null,Pe(D.value,{preserve:!1})}),E(`[data-reload-workflow]`)?.addEventListener(`click`,()=>{Pe(p,{preserve:!0}),m(`Workflow refreshed.`,`success`,1800)}),E(`[data-choose-inputs]`)?.addEventListener(`click`,Ae),V.addEventListener(`click`,()=>{Fe()}),U.addEventListener(`click`,()=>{Ie()}),Ne(),q(),p&&await Pe(p),T.unsubscribe=z(he),()=>{T.unsubscribe?.(),T.unsubscribe=null,T.timer&&=(clearInterval(T.timer),null)}}var W=`opensail.chat.settings.v1`,oe=typeof window<`u`?window.SpeechRecognition||window.webkitSpeechRecognition:null,se=!!oe&&typeof window<`u`&&window.isSecureContext,ce=`/assets/pages/chat.html`,le=null;function ue(){return le||=fetch(ce).then(e=>{if(!e.ok)throw Error(`Could not load the chat layout (${e.status}).`);return e.text()}).catch(e=>{throw le=null,e}),le}function de(e){let t={};try{t=JSON.parse(localStorage.getItem(W)||`{}`)}catch{t={}}return{model:t.model||e.default_chat_model||``,systemPrompt:t.systemPrompt??e.chat_system_prompt??``,thinking:t.thinking??!1,engine:t.engine||`off`,browserVoice:t.browserVoice||``,ttsVoice:t.ttsVoice||``,persona:t.persona||``}}function G(e){try{localStorage.setItem(W,JSON.stringify(e))}catch{}}async function fe(e,n){if(!n.boot)throw Error(`Chat page requires the bootstrap payload.`);let s=n.boot,c=de(s),d=[],v=[],b=!1,x=null,S=[],C=``,w=s.chat_loaded?s.chat_status:`No model loaded. It loads on the first message.`,T=``,E=null,D=`idle`,O=``,k=``,A=!1,j=!1,ee=!1,M=!1,N=!1,P=s.chat_models||[],F=P.map(e=>`<option value="${o(e.path)}" ${e.path===c.model?`selected`:``}>${o(e.alias)}</option>`).join(``),I=s.tts_models||[],te=new Set(I.map(e=>e.id));function L(e){return te.has(e)}function R(){return I.find(e=>e.id===c.engine)||null}e.innerHTML=await ue(),e.querySelectorAll(`[data-icon]`).forEach(e=>{e.innerHTML=l(e.dataset.icon||`info`,e.dataset.iconClass||`h-4 w-4`)});let z=t=>y(e,t),B=z(`[data-messages]`),V=z(`[data-input]`),H=z(`[data-composer]`),U=z(`[data-send]`),ne=z(`[data-stop]`),re=z(`[data-model]`),ie=z(`[data-attach]`),ae=z(`[data-file]`),W=z(`[data-talk]`),ce=z(`[data-talk-label]`),le=z(`[data-attachments]`),fe=z(`[data-chat-status]`),pe=z(`[data-chat-phase]`),me=z(`[data-model-chip]`),K=z(`[data-spoken]`),he=z(`[data-spoken-wrap]`),q=z(`[data-system]`),ge=z(`[data-thinking]`),J=z(`[data-engine]`),_e=z(`[data-browser-voice]`),Y=z(`[data-browser-voice-wrap]`),ve=z(`[data-tts-voice]`),ye=z(`[data-tts-voice-wrap]`),be=z(`[data-persona]`),xe=z(`[data-persona-save]`),Se=z(`[data-persona-delete]`),X=s.chat_personas||{},Z=``,Q=``;oe&&(W.classList.remove(`hidden`),se||(W.classList.add(`cursor-not-allowed`,`opacity-40`),W.title=`Voice input requires HTTPS or localhost.`,W.setAttribute(`aria-label`,W.title))),re.innerHTML=F||`<option value="">No models configured</option>`,q.value=c.systemPrompt,ge.checked=c.thinking;for(let e of I){let t=document.createElement(`option`);t.value=e.id,t.textContent=e.alias,J.append(t)}[...J.options].map(e=>e.value).includes(c.engine)&&(J.value=c.engine),c.engine=J.value,G(c);function $(){return`
      <div class="flex h-full min-h-[24rem] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent-400/20 bg-accent-500/10 text-accent-300">${l(`chat`,`h-7 w-7`)}</div>
        <div>
          <p class="text-sm font-semibold text-slate-200">Start a conversation</p>
          <p class="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">Replies stream from a local GGUF model. Attach an image if the selected model has a vision projector configured.</p>
        </div>
        <div class="flex flex-wrap justify-center gap-2">
          ${[`Summarize this image`,`Help me write a prompt`,`Explain a ComfyUI node`].map(e=>`<button class="chip transition hover:border-accent-400/30 hover:text-accent-200" data-suggestion="${o(e)}">${o(e)}</button>`).join(``)}
        </div>
      </div>
    `}function Ce(){d.length?(B.innerHTML=d.map((e,t)=>e.role===`user`?`
            <div class="flex justify-end gap-2.5 px-4 py-2 sm:px-5" data-message="${t}">
              <div class="min-w-0 max-w-[88%]">
                <div class="chat-bubble-user">${p(e.content)}</div>
                ${e.images?.length?`<div class="mt-2 flex flex-wrap justify-end gap-2">${e.images.map(e=>`<a href="${o(e.url)}" target="_blank" rel="noopener noreferrer" class="block h-20 w-20 overflow-hidden rounded-xl border border-white/10"><img src="${o(e.url)}" alt="Attached image" class="h-full w-full object-cover" /></a>`).join(``)}</div>`:``}
              </div>
              <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[11px] font-semibold text-slate-400">You</span>
            </div>
          `:`
          <div class="flex gap-2.5 px-4 py-2 sm:px-5" data-message="${t}">
            <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-accent-300">${l(`sparkles`,`h-4 w-4`)}</span>
            <div class="chat-bubble-assistant min-w-0">
              <div class="prose-notes" data-bubble>${f(e.content)||`<span class="text-slate-500">${e.stopped?`Stopped.`:`Thinking…`}</span>`}</div>
              ${e.streaming?`<span class="mt-1 inline-block h-3.5 w-1 animate-pulse rounded-full bg-accent-400 align-middle"></span>`:``}
            </div>
          </div>
        `).join(``),Te(!0)):(B.innerHTML=$(),B.querySelectorAll(`[data-suggestion]`).forEach(e=>{e.addEventListener(`click`,()=>{V.value=e.dataset.suggestion||``,V.focus()})}))}function we(e){let t=d.indexOf(e),n=B.querySelector(`[data-message="${t}"] [data-bubble]`);if(!n){Ce();return}n.innerHTML=f(e.content)||`<span class="text-slate-500">${e.stopped?`Stopped.`:`Thinking…`}</span>`;let r=n.parentElement?.querySelector(`.animate-pulse`);e.streaming||r?.remove(),Te()}function Te(e=!1){let t=B.scrollHeight-B.scrollTop-B.clientHeight;(e||t<180)&&(B.scrollTop=B.scrollHeight)}function Ee(){le.classList.toggle(`hidden`,!v.length),le.innerHTML=v.map((e,t)=>`
        <div class="relative h-16 w-16 overflow-hidden rounded-lg border border-white/10">
          <img src="${o(e.url)}" alt="${o(e.name||`Attachment`)}" class="h-full w-full object-cover" />
          <button type="button" class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-rose-500" data-remove-attachment="${t}" aria-label="Remove attachment">${l(`close`,`h-3 w-3`)}</button>
        </div>
      `).join(``),le.querySelectorAll(`[data-remove-attachment]`).forEach(e=>{e.addEventListener(`click`,()=>{v.splice(Number(e.dataset.removeAttachment),1),Ee()})})}function De(){let e=!!P.find(e=>e.path===re.value)?.multimodal;ie.classList.toggle(`cursor-pointer`,e),ie.classList.toggle(`cursor-not-allowed`,!e),ie.classList.toggle(`opacity-40`,!e),ie.setAttribute(`aria-disabled`,String(!e)),ie.title=e?`Attach an image`:`This model does not support images`,ae.disabled=!e,!e&&v.length&&(v=[],Ee())}ae.addEventListener(`change`,async e=>{let n=e.target,r=[...n.files||[]];n.value=``;for(let e of r)try{let t=await i(e);v.push({id:t.id,url:t.url,name:t.name}),Ee()}catch(e){m(t(e),`error`)}});function Oe(e){D=e;let t=e===`starting`||e===`listening`;W.classList.toggle(`btn-secondary`,!t),W.classList.toggle(`btn-danger`,t),W.setAttribute(`aria-pressed`,String(t));let n=se?e===`finishing`?`Transcribing…`:t?`Release to Send`:`Hold to Talk`:`Voice input requires HTTPS or localhost.`;ce.textContent=n,W.title=n,W.setAttribute(`aria-label`,n),W.disabled=e===`finishing`||b||!P.length||!se,Je(t?`Listening…`:e===`finishing`?`Transcribing…`:``)}function ke(){if(N||M)return;let e=`${O} ${k}`.replace(/\s+/g,` `).trim(),t=ee;if(E=null,O=``,k=``,A=!1,j=!1,ee=!1,Oe(`idle`),!e){t||m(`No speech was detected.`,`warning`,2200);return}let n=V.value.trim();V.value=n?`${n} ${e}`:e,Ye()}function Ae(){if(j=!0,D!==`idle`&&D!==`finishing`&&D!==`starting`){Oe(`finishing`);try{E?.stop()}catch{ke()}}}function je(){if(!se||!oe||b||!P.length||D!==`idle`)return;M=!1,ee=!1,j=!1,O=``,k=``,`speechSynthesis`in window&&window.speechSynthesis.cancel(),K.pause();let e=new oe;E=e,e.lang=navigator.language||`en-US`,e.continuous=!0,e.interimResults=!0,e.maxAlternatives=1,e.onstart=()=>{N||M||(D===`starting`&&Oe(`listening`),j&&Ae())},e.onresult=e=>{let t=``;for(let n=e.resultIndex;n<e.results.length;n+=1){let r=e.results[n],i=r[0]?.transcript||``;r.isFinal?O+=i:t+=i}k=t},e.onerror=e=>{e.error===`aborted`||N||M||(ee=!0,m({"not-allowed":`Microphone access was denied.`,"audio-capture":`No microphone was found.`,"no-speech":`No speech was detected.`,network:`Speech recognition needs a network connection.`}[e.error]||`Speech recognition failed: ${e.error}`,e.error===`no-speech`?`warning`:`error`))},e.onend=()=>{if(!(N||M)){if(!j&&A&&!ee){O+=k,k=``;try{e.start();return}catch{}}ke()}},Oe(`starting`);try{e.start()}catch(e){E=null,A=!1,m(t(e)||`Could not start speech recognition.`,`error`),Oe(`idle`)}}function Me(){M=!0,j=!0,A=!1,O=``,k=``;let e=E;if(E=null,e)try{e.abort()}catch{}Oe(`idle`)}W.addEventListener(`pointerdown`,e=>{if((e.pointerType!==`mouse`||e.button===0)&&!(b||D!==`idle`)){e.preventDefault(),A=!0;try{W.setPointerCapture(e.pointerId)}catch{}je()}});function Ne(e){if(A){A=!1;try{W.hasPointerCapture(e.pointerId)&&W.releasePointerCapture(e.pointerId)}catch{}Ae()}}W.addEventListener(`pointerup`,Ne),W.addEventListener(`pointercancel`,Ne),W.addEventListener(`lostpointercapture`,()=>{A&&(A=!1,Ae())}),W.addEventListener(`contextmenu`,e=>e.preventDefault()),W.addEventListener(`keydown`,e=>{e.key!==` `&&e.key!==`Enter`||e.repeat||b||D!==`idle`||(e.preventDefault(),A=!0,je())}),W.addEventListener(`keyup`,e=>{(e.key===` `||e.key===`Enter`)&&(e.preventDefault(),A&&(A=!1,Ae()))}),W.addEventListener(`blur`,()=>{A&&(A=!1,Ae())});function Pe(){if(!(`speechSynthesis`in window))return;let e=window.speechSynthesis.getVoices();_e.innerHTML=`<option value="">System default</option>`+e.map(e=>`<option value="${o(e.name)}" ${e.name===c.browserVoice?`selected`:``}>${o(e.name)}${e.lang?` (${o(e.lang)})`:``}</option>`).join(``)}function Fe(e){if(c.engine!==`browser`||!e.trim()||!(`speechSynthesis`in window))return;window.speechSynthesis.cancel();let t=new SpeechSynthesisUtterance(e),n=window.speechSynthesis.getVoices().find(e=>e.name===c.browserVoice);n&&(t.voice=n),window.speechSynthesis.speak(t)}function Ie(){let e=c.engine,t=L(e);Y.classList.toggle(`hidden`,e!==`browser`),ye.classList.toggle(`hidden`,!t),he.classList.toggle(`hidden`,!t||!K.src)}async function Le(){let n=R();if(!n)return;let i=e.querySelector(`[data-refresh-voices]`);_(i,!0,`Loading…`);try{let e=await r(`/api/audio/voices?model_id=${encodeURIComponent(n.id)}`);if(c.engine!==n.id)return;if(S=e.voices||[],C=n.id,!S.length){ve.innerHTML=`<option value="">No voices reported</option>`,m(`No ${n.alias} voices were reported.`,`warning`);return}S.includes(c.ttsVoice)||(c.ttsVoice=S[0],G(c)),ve.innerHTML=S.map(e=>`<option value="${o(e)}" ${e===c.ttsVoice?`selected`:``}>${o(e)}</option>`).join(``),m(`Loaded ${S.length} voice${S.length===1?``:`s`}.`,`success`)}catch(e){m(t(e),`error`)}finally{_(i,!1)}}`speechSynthesis`in window&&(Pe(),window.speechSynthesis.onvoiceschanged=Pe);function Re(e){return e===`browser`?c.browserVoice:L(e)?c.ttsVoice:``}function ze(){return{system_prompt:c.systemPrompt,voice_engine:c.engine,voice:Re(c.engine)}}function Be(e){if(!e)return!1;let t=e.voice_engine||`off`;return(e.system_prompt||``)===c.systemPrompt&&t===c.engine&&(e.voice||``)===Re(t)}function Ve(){let e=!!Z;Se.disabled=!e,Se.classList.toggle(`opacity-40`,!e),Se.classList.toggle(`cursor-not-allowed`,!e)}function He(){let e=Object.keys(X);Z&&!X[Z]&&(Z=``),be.innerHTML=`<option value="">Custom (unsaved)</option>`+e.map(e=>`<option value="${o(e)}" ${e===Z?`selected`:``}>${o(e)}</option>`).join(``),be.value=Z,Ve()}function Ue(){Z&&(Z=``,c.persona=``,He())}async function We(e){c.systemPrompt=e.system_prompt||``,c.engine=e.voice_engine||`off`,q.value=c.systemPrompt,[...J.options].map(e=>e.value).includes(c.engine)||(c.engine=`off`),J.value=c.engine,c.engine===`browser`?(c.browserVoice=e.voice||``,_e.value=c.browserVoice):L(c.engine)&&(c.ttsVoice=e.voice||``),Ie(),G(c),L(c.engine)&&(C!==c.engine&&await Le(),ve.value=c.ttsVoice)}function Ge(){let e=document.createElement(`div`);e.className=`space-y-3`,e.innerHTML=`
      <div>
        <label class="label" for="chat-persona-name">Name</label>
        <input id="chat-persona-name" class="input" maxlength="80" placeholder="e.g. Writing coach" value="${o(Z||Q)}" />
      </div>
      <p class="text-[11px] leading-5 text-slate-500">Saves the current system prompt, speech engine and voice. Using an existing name updates that persona.</p>
    `;let n=document.createElement(`div`);n.className=`flex items-center justify-end gap-2`,n.innerHTML=`
      <button class="btn-secondary" data-cancel>Cancel</button>
      <button class="btn-primary" data-confirm>${l(`save`,`h-4 w-4`)}<span>Save persona</span></button>
    `;let i=h({title:`Save persona`,subtitle:`Personas are stored on the server.`,content:e,footer:n}),a=y(e,`#chat-persona-name`),u=y(n,`[data-confirm]`),d=y(n,`[data-cancel]`),f=async()=>{let e=a.value.trim();if(!e)m(`Type a persona name first.`,`warning`),a.focus();else if(!X[e]||e===Z||e===Q||await g(`A persona called “${e}” already exists. Overwrite it?`,{title:`Overwrite persona`,confirmLabel:`Overwrite`,danger:!0})){_(u,!0,`Saving…`);try{X=(await r(`/api/chat/personas`,{method:`POST`,body:{name:e,...ze()}})).personas||{},s.chat_personas=X,Z=e,Q=e,c.persona=e,G(c),He(),i.close(),m(`Saved persona “${e}”.`,`success`)}catch(e){m(t(e),`error`),_(u,!1)}}};d.addEventListener(`click`,()=>i.close()),u.addEventListener(`click`,()=>{f()}),a.addEventListener(`keydown`,e=>{e.key===`Enter`&&(e.preventDefault(),f())})}be.addEventListener(`change`,async()=>{let e=be.value;Z=e,Q=e,c.persona=e;try{e&&X[e]?await We(X[e]):G(c)}catch(e){m(t(e),`error`)}He()}),xe.addEventListener(`click`,Ge),Se.addEventListener(`click`,async()=>{let e=Z;if(e&&await g(`Delete the persona “${e}”?`,{title:`Delete persona`,confirmLabel:`Delete`,danger:!0})){_(Se,!0,`Deleting…`);try{X=(await r(`/api/chat/personas/delete`,{method:`POST`,body:{name:e}})).personas||{},s.chat_personas=X,Z=``,Q=``,c.persona=``,G(c),He(),m(`Persona deleted.`,`success`)}catch(e){m(t(e),`error`)}finally{_(Se,!1),Ve()}}}),q.addEventListener(`input`,()=>{c.systemPrompt=q.value,Ue(),G(c)}),ge.addEventListener(`change`,()=>{c.thinking=ge.checked,G(c)}),J.addEventListener(`change`,()=>{c.engine=J.value,Ue(),G(c),Ie(),L(c.engine)&&C!==c.engine&&Le()}),_e.addEventListener(`change`,()=>{c.browserVoice=_e.value,Ue(),G(c)}),ve.addEventListener(`change`,()=>{c.ttsVoice=ve.value,Ue(),G(c)}),e.querySelector(`[data-refresh-voices]`)?.addEventListener(`click`,()=>{Le()}),Ie(),He(),c.persona&&X[c.persona]&&Be(X[c.persona])?(Z=c.persona,Q=Z,He()):c.persona&&(c.persona=``,G(c));function Ke(e,t){w=e,fe.textContent=e,me.textContent=t?`Loaded`:`Idle`,me.className=`chip ${t?`chip-success`:``}`}e.querySelector(`[data-load]`)?.addEventListener(`click`,async e=>{let i=e.currentTarget;_(i,!0,`Loading…`);try{let e=await r(`/api/chat/load`,{method:`POST`,body:{path:re.value}});Ke(e.status||``,!!e.loaded),n.refreshStatus(),m(`Chat model loaded.`,`success`)}catch(e){m(t(e),`error`)}finally{_(i,!1)}}),e.querySelector(`[data-unload]`)?.addEventListener(`click`,async e=>{let i=e.currentTarget;_(i,!0,`Unloading…`);try{let e=await r(`/api/chat/unload`,{method:`POST`});Ke(e.status||``,!!e.loaded),n.refreshStatus(),m(`Chat model unloaded.`,`success`)}catch(e){m(t(e),`error`)}finally{_(i,!1)}}),re.addEventListener(`change`,()=>{c.model=re.value,G(c),De()});function qe(e){b=e,U.disabled=e,U.innerHTML=e?`${u(`h-3.5 w-3.5`)} Sending…`:`${l(`send`,`h-4 w-4`)} Send`,ne.disabled=!e,W.disabled=e||!se||!P.length||D===`finishing`}function Je(e){T=e||``,pe.textContent=T,pe.classList.toggle(`hidden`,!T),pe.className=`chip ${T?`chip-warn`:``} hidden sm:inline-flex`}async function Ye(){if(b||D!==`idle`)return;let e=V.value.trim();if(!e&&!v.length)return;let r={role:`user`,content:e,images:v};d.push(r),v=[],Ee(),V.value=``,V.style.height=`auto`;let i={role:`assistant`,content:``,streaming:!0};d.push(i),Ce(),qe(!0),Je(`Preparing…`),x=new AbortController;let o=d.filter(e=>!e.streaming).map(e=>({role:e.role,content:e.content,images:(e.images||[]).map(e=>e.id)})),s=!1;try{await a(`/api/chat/stream`,{messages:o,system_prompt:c.systemPrompt,enable_thinking:c.thinking,speak_engine:c.engine,voice:L(c.engine)&&c.ttsVoice||null,model_path:c.model||null},e=>{e.type===`phase`?Je(e.message):e.type===`model`?(Ke(e.status||``,!!e.loaded),n.refreshStatus()):e.type===`chunk`?(i.content=e.text||``,we(i)):e.type===`audio`?(K.src=e.url||``,he.classList.remove(`hidden`),K.play().catch(()=>{})):e.type===`warning`?m(e.message,`warning`):e.type===`error`?(i.content=i.content?`${i.content}\n\n**Error:** ${e.message}`:`**Error:** ${e.message}`,m(e.message,`error`)):e.type===`done`&&(i.streaming=!1)},x.signal)}catch(e){if(e.name===`AbortError`)s=!0;else{let n=t(e);i.content=i.content?`${i.content}\n\n**Error:** ${n}`:`**Error:** ${n}`,m(n,`error`)}}finally{s&&!i.content&&(i.stopped=!0),i.streaming=!1,Ce(),qe(!1),Je(``),x=null,!s&&c.engine===`browser`&&i.content&&Fe(i.content)}}async function Xe(){if(!b)return;ne.disabled=!0;let e=!1,n=r(`/api/chat/cancel`,{method:`POST`}).catch(n=>{e=!0,m(t(n),`error`)});x?.abort(),Je(`Stopping…`),await n,e||m(`Stopped the reply.`,`warning`,1800)}return H.addEventListener(`submit`,e=>{e.preventDefault(),Ye()}),V.addEventListener(`keydown`,e=>{e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),Ye())}),V.addEventListener(`input`,()=>{V.style.height=`auto`,V.style.height=`${Math.min(V.scrollHeight,192)}px`}),ne.addEventListener(`click`,()=>{Xe()}),e.querySelector(`[data-new-chat]`)?.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),D!==`idle`&&Me(),b&&(x?.abort(),r(`/api/chat/cancel`,{method:`POST`}).catch(()=>{})),d.length=0,v=[],Ee(),Ce(),Je(``)}),Ce(),qe(!1),Ke(w,s.chat_loaded),De(),()=>{if(N=!0,E){try{E.abort()}catch{}E=null}b&&(x?.abort(),r(`/api/chat/cancel`,{method:`POST`}).catch(()=>{})),`speechSynthesis`in window&&window.speechSynthesis.cancel()}}async function pe(e,n){let s=n.boot;if(!s)throw Error(`TTS page requires the bootstrap payload.`);let c=s.audio_models||[],d=s.default_audio_model||c[0]?.id||``,f=[],p=[],h=null,v=``,x=``,S=!1,C=null,w=null,T=s.audio_status||`audio.cpp server not running.`;e.innerHTML=`
    <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div class="min-w-0 space-y-5">
        <section class="card">
          <div class="card-header">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-fuchsia-500/10 text-fuchsia-300">${l(`mic`,`h-4 w-4`)}</span>
              <div>
                <h2 class="card-title">Speech</h2>
                <p class="card-subtitle">Generated by a local audio.cpp server</p>
              </div>
            </div>
            <span class="chip ${s.audio_loaded?`chip-success`:``}" data-model-chip>${s.audio_loaded?`Running`:`Idle`}</span>
          </div>
          <div class="space-y-4 p-4 sm:p-5">
            ${c.length?`<div class="flex flex-col gap-2 sm:flex-row">
                    <select class="select min-w-0 flex-1" data-model aria-label="Text to speech model">
                      ${c.map(e=>`<option value="${o(e.id)}" ${e.id===d?`selected`:``}>${o(e.alias)}</option>`).join(``)}
                    </select>
                    <div class="flex shrink-0 gap-2">
                      <button class="btn-secondary btn-xs" data-load>${l(`play`,`h-3.5 w-3.5`)} Load</button>
                      <button class="btn-ghost btn-xs" data-unload>${l(`stop`,`h-3.5 w-3.5`)} Unload</button>
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
              <button class="btn-secondary btn-xs" data-refresh-voices>${l(`refresh`,`h-4 w-4`)} Refresh voices</button>
              <span class="text-[11px] text-slate-500" data-voice-status>Voices are listed from the running server.</span>
            </div>
          </div>
        </section>

        <section class="card">
          <details class="group">
            <summary class="card-header cursor-pointer list-none select-none">
              <div class="flex items-center gap-2.5">
                <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300">${l(`wand`,`h-4 w-4`)}</span>
                <div>
                  <h2 class="card-title">Voice cloning & advanced</h2>
                  <p class="card-subtitle">Optional reference clip and sampler controls</p>
                </div>
              </div>
              <span class="text-slate-500 transition group-open:rotate-180">${l(`chevron`,`h-4 w-4`)}</span>
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
              <button class="btn-primary min-w-[9rem] flex-1" data-generate ${c.length?``:`disabled`}>${l(`play`,`h-4 w-4`)} Generate speech</button>
              <button class="btn-danger min-w-[7rem] flex-1" data-stop disabled>${l(`stop`,`h-4 w-4`)} Stop</button>
            </div>
            <div class="hidden items-center gap-2 text-xs text-slate-400" data-phase-wrap>
              ${u(`h-3.5 w-3.5`)}
              <span data-phase>Generating…</span>
            </div>
          </div>
        </section>
      </div>

      <aside class="min-w-0 space-y-5 xl:sticky xl:top-24 xl:self-start">
        <section class="card overflow-hidden">
          <div class="card-header">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">${l(`volume`,`h-4 w-4`)}</span>
              <div>
                <h2 class="card-title">Output</h2>
                <p class="card-subtitle" data-result-subtitle>No speech generated yet.</p>
              </div>
            </div>
            <a class="btn-ghost btn-xs hidden" data-download download>${l(`download`,`h-4 w-4`)} Download</a>
          </div>
          <div class="p-4 sm:p-5" data-result></div>
        </section>
      </aside>
    </div>
  `;let E=t=>y(e,t),D=e.querySelector(`[data-model]`),k=E(`[data-voice]`),A=E(`[data-status]`),j=E(`[data-model-chip]`),ee=E(`[data-phase-wrap]`),M=E(`[data-phase]`),N=E(`[data-result]`),P=E(`[data-result-subtitle]`),F=E(`[data-download]`),I=E(`[data-generate]`),te=E(`[data-stop]`),L=E(`[data-speed]`),R=E(`[data-speed-number]`),z=E(`[data-speed-label]`),B=E(`[data-text]`);function V(e,t){T=e,A.textContent=e,t!==void 0&&(j.textContent=t?`Running`:`Idle`,j.className=`chip ${t?`chip-success`:``}`)}function H(){if(!f.length)k.innerHTML=`<option value="">Default voice</option>`,k.disabled=!0;else{k.disabled=!1;let e=k.value,t=f.includes(e)?e:f[0];k.innerHTML=f.map(e=>`<option value="${o(e)}" ${e===t?`selected`:``}>${o(e)}</option>`).join(``),k.value=t}E(`[data-voice-status]`).textContent=f.length?`${f.length} voice${f.length===1?``:`s`} available.`:`Voices are listed from the running server.`}function U(){let t=e.querySelector(`[data-saved-voices-panel]`);t&&(p.length?(t.innerHTML=`
      <div class="mb-2 flex items-center justify-between gap-2">
        <p class="text-xs font-semibold text-slate-300">Saved voices</p>
        <span class="text-[11px] text-slate-500">${p.length}</span>
      </div>
      <ul class="space-y-1.5">
        ${p.map(e=>`
          <li class="flex items-center gap-2 rounded-lg border border-subtle bg-ink-950/40 px-2.5 py-1.5">
            <span class="min-w-0 flex-1 truncate text-xs text-slate-300">${o(e)}</span>
            <button type="button" class="btn-ghost btn-xs shrink-0 text-rose-300 hover:bg-rose-500/10" data-delete-voice="${o(e)}" title="Delete ${o(e)}">${l(`trash`,`h-3.5 w-3.5`)}</button>
          </li>`).join(``)}
      </ul>
    `,t.querySelectorAll(`[data-delete-voice]`).forEach(e=>{e.addEventListener(`click`,()=>{ue(e.dataset.deleteVoice||``,e)})})):t.innerHTML=`<p class="text-[11px] leading-5 text-slate-500">No saved custom voices yet. Upload a reference clip above and save it to reuse it here and in Chat.</p>`)}async function ne(){try{p=(await r(`/api/audio/saved-voices`)).voices||[]}catch{p=[]}U()}function re(){w?(F.href=w.url,F.classList.remove(`hidden`),P.textContent=w.filename||`Generated speech`,N.innerHTML=`
      <div class="rounded-2xl border border-subtle bg-raised p-5">
        <div class="mb-4 flex items-center gap-3">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">${l(`volume`,`h-5 w-5`)}</span>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-slate-200">${o(w.filename||`Generated speech`)}</p>
            <p class="text-xs text-slate-500">audio.cpp</p>
          </div>
        </div>
        <audio class="w-full" controls autoplay src="${o(w.url)}"></audio>
      </div>
    `):(F.classList.add(`hidden`),P.textContent=`No speech generated yet.`,N.innerHTML=b(`Your audio will appear here`,`Enter some text and press Generate speech. The local model starts automatically on the first run.`,`volume`))}function ie(e){S=e,I.disabled=e||!c.length,I.innerHTML=e?`${u(`h-4 w-4`)} Generating…`:`${l(`play`,`h-4 w-4`)} Generate speech`,te.disabled=!e,ee.classList.toggle(`hidden`,!e)}async function ae(){if(!d)return;let i=e.querySelector(`[data-load]`);_(i,!0,`Loading…`);try{let e=await r(`/api/audio/load`,{method:`POST`,body:{model_id:d}});f=e.voices||[],H(),V(e.status||``,e.loaded),n.refreshStatus(),m(`Audio model loaded.`,`success`)}catch(e){m(t(e),`error`)}finally{_(i,!1)}}async function W(){let i=e.querySelector(`[data-unload]`);_(i,!0,`Stopping…`);try{let e=await r(`/api/audio/unload`,{method:`POST`});f=[],H(),V(e.status||``,e.loaded),n.refreshStatus(),m(`audio.cpp server stopped.`,`success`)}catch(e){m(t(e),`error`)}finally{_(i,!1)}}async function oe(){if(!d)return;let i=e.querySelector(`[data-refresh-voices]`);_(i,!0,`Loading…`);try{f=(await r(`/api/audio/voices?model_id=${encodeURIComponent(d)}`)).voices||[],H(),V(`audio.cpp server running.`,!0),n.refreshStatus(),m(`Loaded ${f.length} voice${f.length===1?``:`s`}.`,`success`)}catch(e){m(t(e),`error`)}finally{_(i,!1)}}async function se(e){let t=await i(e);h={id:t.id,url:t.url,name:t.name||e.name},fe(),m(`Reference clip ready.`,`success`)}function ce(e,t){O({source:e,name:t||`reference`,title:`Trim reference clip`,subtitle:`Choose the part of the clip to keep before uploading. Trimmed selections are saved as WAV.`,onApply:e=>se(e)})}async function le(){if(!h){m(`Upload a reference clip first.`,`warning`);return}let n=x.trim();if(!n){m(`Give the voice a name first.`,`warning`);return}let i=e.querySelector(`[data-save-voice]`);_(i,!0,`Saving…`);try{let e=await r(`/api/audio/save-voice`,{method:`POST`,body:{model_id:d,name:n,upload:h.id,transcript:v}});f=e.voices||[],H(),k.value=e.name||``,x=``,await ne(),fe(),m(e.status,`success`)}catch(e){m(t(e),`error`)}finally{_(i,!1)}}async function ue(e,n){if(await g(`Delete the saved voice “${e}”? Its reference clip and transcript entry will be removed.`,{title:`Delete saved voice`,confirmLabel:`Delete`,danger:!0})){_(n,!0,`Deleting…`);try{let t=await r(`/api/audio/delete-voice`,{method:`POST`,body:{name:e}});p=t.voices||p.filter(t=>t!==e),U(),f=f.filter(n=>n!==e&&n!==t.name),H(),m(t.status,`success`)}catch(e){m(t(e),`error`),n.isConnected&&_(n,!1)}}}async function de(){if(S||!d)return;let e=B.value.trim();if(!e)m(`Type the text to speak first.`,`warning`);else{ie(!0),M.textContent=`Starting audio.cpp…`,w=null,re(),C=new AbortController;try{await a(`/api/audio/generate`,{model_id:d,text:e,voice:k.value||null,speed:Number(R.value)||1,seed:Number(E(`[data-seed]`).value)||0,max_tokens:Number(E(`[data-max-tokens]`).value)||0,voice_ref:h?.id||null,reference_text:v},e=>{e.type===`phase`?M.textContent=e.message||``:e.type===`result`?(w={...e,url:e.url||``,filename:`generated-speech.wav`},re()):e.type===`error`?m(e.message,`error`):e.type===`done`&&(M.textContent=`Done.`)},C.signal)}catch(e){e.name!==`AbortError`&&m(t(e),`error`)}finally{ie(!1),C=null,n.refreshStatus()}}}async function G(){try{await r(`/api/audio/cancel`,{method:`POST`}),C?.abort(),m(`Stopping speech generation…`,`warning`,1800)}catch(e){m(t(e),`error`)}}D?.addEventListener(`change`,()=>{d=D.value,f=[],k.value=``,H()}),e.querySelector(`[data-load]`)?.addEventListener(`click`,()=>{ae()}),e.querySelector(`[data-unload]`)?.addEventListener(`click`,()=>{W()}),e.querySelector(`[data-refresh-voices]`)?.addEventListener(`click`,()=>{oe()}),I.addEventListener(`click`,()=>{de()}),te.addEventListener(`click`,()=>{G()}),L.addEventListener(`input`,()=>{R.value=L.value,z.textContent=`${Number(L.value).toFixed(2)}×`}),R.addEventListener(`input`,()=>{let e=Math.min(2,Math.max(.5,Number(R.value)||1));L.value=String(e),z.textContent=`${e.toFixed(2)}×`});function fe(){let t=e.querySelector(`[data-ref-panel]`);t&&(t.innerHTML=`
      <div class="flex flex-wrap items-center gap-2">
        <label class="btn-secondary btn-xs cursor-pointer">
          ${l(`upload`,`h-3.5 w-3.5`)} ${h?`Replace clip`:`Upload reference clip`}
          <input type="file" accept="audio/*" class="sr-only" data-ref-upload />
        </label>
        ${h?`<span class="min-w-0 flex-1 truncate text-[11px] text-slate-400">${o(h.name||`Reference clip`)}</span>`:`<span class="text-[11px] text-slate-500">WAV, MP3, FLAC, OGG or M4A</span>`}
        ${h?`<button class="btn-ghost btn-xs" data-ref-trim>${l(`scissors`,`h-3.5 w-3.5`)} Trim</button>`:``}
        ${h?`<button class="btn-ghost btn-xs text-rose-300 hover:bg-rose-500/10" data-ref-clear>${l(`trash`,`h-3.5 w-3.5`)}</button>`:``}
      </div>
      ${h?`<audio class="mt-3 w-full" controls src="${o(h.url)}"></audio>`:``}
      <textarea class="textarea mt-3 text-xs" rows="2" data-ref-text placeholder="What is said in the clip? (optional, improves cloning)">${o(v)}</textarea>
      <div class="mt-3 flex flex-col gap-2 sm:flex-row">
        <input class="input min-w-0 flex-1" data-voice-name value="${o(x)}" placeholder="Save clip as voice, e.g. morgan" />
        <button class="btn-secondary btn-xs shrink-0" data-save-voice>${l(`save`,`h-4 w-4`)} Save voice</button>
      </div>
      <p class="mt-2 text-[11px] leading-5 text-slate-500">A reference clip overrides the Voice field. Saved voices are shared with the Chat page.</p>
    `,t.querySelector(`[data-ref-text]`)?.addEventListener(`input`,e=>{v=e.target.value}),t.querySelector(`[data-voice-name]`)?.addEventListener(`input`,e=>{x=e.target.value}),t.querySelector(`[data-save-voice]`)?.addEventListener(`click`,()=>{le()}),t.querySelector(`[data-ref-upload]`)?.addEventListener(`change`,e=>{let t=e.target,n=t.files?.[0];t.value=``,n&&ce(n,n.name)}),t.querySelector(`[data-ref-trim]`)?.addEventListener(`click`,()=>{h&&ce(h.url,h.name)}),t.querySelector(`[data-ref-clear]`)?.addEventListener(`click`,()=>{h=null,fe()}))}return fe(),H(),ne(),re(),ie(!1),V(T,s.audio_loaded),()=>{S&&(C?.abort(),r(`/api/audio/cancel`,{method:`POST`}).catch(()=>{}))}}var me={images:{icon:`image`,noun:`image`,endpoint:`/api/gallery/images`,empty:`Generate an image in the Generate page or add one to the media folder, then press Refresh.`},audio:{icon:`music`,noun:`audio clip`,endpoint:`/api/gallery/audio`,empty:`Generate music or speech in ComfyUI or add audio to the media folder, then press Refresh.`},videos:{icon:`film`,noun:`video`,endpoint:`/api/gallery/videos`,empty:`Generate or upscale a video in ComfyUI or add one to the media folder, then press Refresh.`}};function K(e){return(e.prompt||``).trim()}function he(e,t){return e.type===`local`?`From the media folder`:t}function q(e){return e.subfolder?`${e.subfolder}/${e.filename}`:e.filename}function ge(e){return[e.type||``,e.subfolder||``,e.filename,e.prompt_id||``].join(`\0`)}function J(e,t=`mt-1.5 px-1`){let n=s(e.created_at);return n?`<p class="flex items-center gap-1 text-[11px] text-slate-500 ${t}">${l(`clock`,`h-3 w-3`)}<span class="truncate">${n}</span></p>`:``}function _e(e,t=``){let n=e.type===`local`;return`<span class="pointer-events-none inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur-sm ${t}">${l(n?`folder`:`cpu`,`h-3 w-3`)}${n?`Media`:`ComfyUI`}</span>`}function Y(e){if(typeof e==`string`)return e;try{return JSON.stringify(e,null,2)??String(e)}catch{return String(e)}}function ve(e,t){return`<details class="group mt-2 overflow-hidden rounded-xl border border-subtle bg-ink-950/60">
    <summary class="flex cursor-pointer list-none select-none items-center justify-between gap-2 px-3 py-2 text-[11px] font-medium text-slate-300">
      <span>${o(e)}</span>
      <span class="text-slate-500 transition group-open:rotate-180">${l(`chevron`,`h-3.5 w-3.5`)}</span>
    </summary>
    <pre class="max-h-72 overflow-auto border-t border-subtle p-3 font-mono text-[11px] leading-5 text-slate-300">${o(Y(t))}</pre>
  </details>`}function ye(){return`<section class="rounded-2xl border border-subtle bg-raised p-4" data-image-metadata>
    <div class="flex items-center gap-2 text-xs text-slate-500">${u(`h-4 w-4`)} Reading ComfyUI metadata…</div>
  </section>`}async function be(e,n){if(!n)return;let i=new URLSearchParams({filename:e.filename||``,subfolder:e.subfolder||``,type:e.type||`output`});try{let e=await r(`/api/gallery/image-metadata?${i.toString()}`);if(!n.isConnected)return;let t=e?.metadata||{},a=(Array.isArray(t.summary)?t.summary:[]).filter(e=>e&&e.label&&e.value!==void 0&&e.value!==null&&e.value!==``),s=[[`Prompt (API format)`,t.prompt],[`Workflow (UI format)`,t.workflow],[`Parameters`,t.parameters],[`Comment`,t.comment],[`Description`,t.description],[`Title`,t.title]].filter(([,e])=>e!=null&&e!==``),c=a.length?`<dl class="mt-3 space-y-3">${a.map(e=>`<div>
              <dt class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">${o(e.label)}</dt>
              <dd class="mt-0.5 whitespace-pre-wrap break-words text-xs leading-5 text-slate-200">${o(e.value)}</dd>
            </div>`).join(``)}</dl>`:``,l=s.map(([e,t])=>ve(e,t)).join(``),u=!!(c||l);n.innerHTML=`
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">ComfyUI metadata</h3>
        ${u?`<span class="text-[10px] text-slate-500">Embedded in this image</span>`:``}
      </div>
      ${u?`${c}${l}`:`<p class="mt-2 text-xs text-slate-500">No ComfyUI metadata is embedded in this image.</p>`}
    `}catch(e){if(!n.isConnected)return;n.innerHTML=`<p class="text-xs leading-5 text-rose-300">Could not read metadata: ${o(t(e))}</p>`}}async function xe(e,n,i){let a=me[i],s=[],c=new Set,d=!1;e.innerHTML=`
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold tracking-tight text-slate-100">Recent ${i}</h2>
          <p class="mt-0.5 text-xs text-slate-500" data-count>Loading from ComfyUI history and the media folder…</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn-secondary btn-xs hidden" data-move-selected>${l(`folder`,`h-4 w-4`)} Move to media</button>
          <button class="btn-danger btn-xs hidden" data-delete-selected>${l(`trash`,`h-4 w-4`)} Delete selected</button>
          <button class="btn-secondary btn-xs" data-refresh>${l(`refresh`,`h-4 w-4`)} Refresh</button>
        </div>
      </div>
      <div data-grid></div>
    </div>
  `;let f=y(e,`[data-grid]`),p=y(e,`[data-count]`),_=y(e,`[data-refresh]`),v=y(e,`[data-delete-selected]`),x=y(e,`[data-move-selected]`);function S(){let e=s.filter(e=>c.has(ge(e))),t=e.length,n=e.filter(e=>e.type!==`local`&&e.prompt_id).length;v.classList.toggle(`hidden`,t===0),v.disabled=d||t===0,v.innerHTML=`${l(`trash`,`h-4 w-4`)} Delete selected${t?` (${t})`:``}`,x.classList.toggle(`hidden`,n===0),x.disabled=d||n===0,x.innerHTML=`${l(`folder`,`h-4 w-4`)} Move to media${n?` (${n})`:``}`}function C(e,t){return`<label class="absolute bottom-2 right-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-white/20 bg-black/55 backdrop-blur-sm transition hover:bg-black/75" title="Select ${o(q(t))}">
      <input type="checkbox" class="h-4 w-4 cursor-pointer rounded border-white/40 bg-transparent accent-accent-500" data-select-item="${e}" ${c.has(ge(t))?`checked`:``} aria-label="Select ${o(q(t))}" />
    </label>`}function w(){f.querySelectorAll(`[data-select-item]`).forEach(e=>{e.addEventListener(`change`,()=>{let t=s[Number(e.dataset.selectItem)];if(!t)return;e.checked?c.add(ge(t)):c.delete(ge(t));let n=e.closest(`[data-selectable]`);n&&(n.classList.toggle(`ring-2`,e.checked),n.classList.toggle(`ring-accent-400`,e.checked)),S()})})}function T(){return i===`audio`?`<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${Array.from({length:8}).map(()=>`<div class="skeleton h-28 rounded-2xl"></div>`).join(``)}
      </div>`:`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      ${Array.from({length:10}).map(()=>`<div class="skeleton aspect-square rounded-2xl"></div>`).join(``)}
    </div>`}function E(e){let t=K(e);be(e,h({title:q(e)||`Image`,subtitle:t||he(e,`Generated by ComfyUI`),size:`lg`,content:`<div class="space-y-4">
        <div class="flex items-center justify-center overflow-hidden rounded-2xl border border-subtle bg-ink-950">
          <img src="${o(e.url)}" alt="${o(q(e))}" class="max-h-[72vh] w-full object-contain" />
        </div>
        ${ye()}
      </div>`,footer:`<div class="flex w-full items-center justify-between gap-3">
        <a class="btn-ghost btn-xs" href="${o(e.url)}" target="_blank" rel="noopener noreferrer">${l(`external`,`h-4 w-4`)} Open original</a>
        <a class="btn-secondary btn-xs" href="${o(e.url)}" download>${l(`download`,`h-4 w-4`)} Download</a>
      </div>`}).body.querySelector(`[data-image-metadata]`))}function D(e){let t=K(e);h({title:q(e)||`Video`,subtitle:t||he(e,`Generated by ComfyUI`),size:`lg`,content:`<div class="flex items-center justify-center overflow-hidden rounded-2xl border border-subtle bg-ink-950">
        <video class="max-h-[72vh] w-full" controls autoplay playsinline src="${o(e.url)}"${e.thumbnail_url?` poster="${o(e.thumbnail_url)}"`:``}></video>
      </div>`,footer:`<div class="flex w-full items-center justify-between gap-3">
        <a class="btn-ghost btn-xs" href="${o(e.url)}" target="_blank" rel="noopener noreferrer">${l(`external`,`h-4 w-4`)} Open original</a>
        <a class="btn-secondary btn-xs" href="${o(e.url)}" download>${l(`download`,`h-4 w-4`)} Download</a>
      </div>`})}function O(){p.textContent=`${s.length} ${a.noun}${s.length===1?``:`s`} in recent history and the media folder`,s.length?i===`images`?(f.innerHTML=`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        ${s.map((e,t)=>`
            <div class="rounded-2xl transition" data-selectable>
              <div class="relative">
                <button class="gallery-tile group block aspect-square w-full text-left" data-image="${t}" title="${o(q(e))}">
                  <img src="${o(e.thumbnail_url||e.url)}" data-full-src="${o(e.url)}" alt="${o(q(e))}" loading="lazy" class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                  <span class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                    <span class="block truncate text-[11px] font-medium text-white">${o(q(e))}</span>
                    ${K(e)?`<span class="mt-0.5 line-clamp-2 text-[10px] leading-4 text-white/60">${o(K(e))}</span>`:``}
                  </span>
                </button>
                ${_e(e,`absolute left-2 top-2 z-10`)}
                ${C(t,e)}
              </div>
              ${J(e)}
            </div>
          `).join(``)}
      </div>`,f.querySelectorAll(`[data-image]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=s[Number(e.dataset.image)];t&&E(t)})}),f.querySelectorAll(`img[data-full-src]`).forEach(e=>{e.addEventListener(`error`,()=>{let t=e.dataset.fullSrc;t&&e.getAttribute(`src`)!==t?e.src=t:e.hidden=!0})}),w()):i===`audio`?(f.innerHTML=`<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${s.map((e,t)=>`
            <div class="card-soft p-4 transition" data-selectable>
              <div class="mb-3 flex items-center gap-3">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">${l(`music`,`h-4 w-4`)}</span>
                <div class="min-w-0">
                  <p class="truncate text-xs font-semibold text-slate-200">${o(q(e))}</p>
                  <p class="truncate text-[11px] text-slate-500">${o(K(e)||he(e,`Generated audio`))}</p>
                </div>
                ${_e(e,`ml-auto shrink-0`)}
              </div>
              <audio class="w-full" controls preload="none" src="${o(e.url)}"></audio>
              <div class="mt-3 flex items-center justify-between gap-3">
                <a class="btn-ghost btn-xs" href="${o(e.url)}" download>${l(`download`,`h-4 w-4`)} Download</a>
                <label class="flex cursor-pointer items-center gap-2 text-[11px] text-slate-500" title="Select ${o(q(e))}">
                  <span>Select</span>
                  <input type="checkbox" class="h-4 w-4 cursor-pointer rounded border-white/30 bg-transparent accent-accent-500" data-select-item="${t}" ${c.has(ge(e))?`checked`:``} aria-label="Select ${o(q(e))}" />
                </label>
              </div>
              ${J(e,`mt-2`)}
            </div>
          `).join(``)}
      </div>`,w()):(f.innerHTML=`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      ${s.map((e,t)=>`
          <div class="rounded-2xl transition" data-selectable>
            <div class="relative">
              <button class="gallery-tile group block aspect-square w-full text-left" data-video="${t}" title="${o(q(e))}">
                <span class="absolute inset-0 flex items-center justify-center text-slate-600">${l(`film`,`h-8 w-8`)}</span>
                ${e.thumbnail_url?`<img src="${o(e.thumbnail_url)}" data-thumbnail alt="${o(q(e))}" loading="lazy" class="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />`:``}
                <span class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/25">
                  <span class="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm">
                    ${l(`play`,`h-5 w-5`)}
                  </span>
                </span>
                <span class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                  <span class="block truncate text-[11px] font-medium text-white">${o(q(e))}</span>
                  ${K(e)?`<span class="mt-0.5 line-clamp-2 text-[10px] leading-4 text-white/60">${o(K(e))}</span>`:``}
                </span>
              </button>
              ${_e(e,`absolute left-2 top-2 z-10`)}
              ${C(t,e)}
            </div>
            ${J(e)}
          </div>
        `).join(``)}
    </div>`,f.querySelectorAll(`[data-video]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=s[Number(e.dataset.video)];t&&D(t)})}),f.querySelectorAll(`img[data-thumbnail]`).forEach(e=>{e.addEventListener(`error`,()=>e.remove())}),w()):f.innerHTML=`<div class="card">${b(`No ${i} yet`,a.empty,a.icon)}</div>`}async function k(){if(d)return;let e=s.filter(e=>c.has(ge(e))),n=e.filter(e=>e.type!==`local`&&e.prompt_id),i=e.length-n.length;if(!n.length)return;let a=new Set(n.map(e=>e.prompt_id)),o=`Move ${n.length} selected item${n.length===1?``:`s`} to the media folder? This copies all outputs from ${a.size} ComfyUI generation${a.size===1?``:`s`} and removes those history entries.`;if(i&&(o+=` ${i} local item${i===1?``:`s`} in the selection are already in the media folder and will be left untouched.`),await g(o,{title:`Move selected media?`,confirmLabel:`Move`})){x.disabled=!0,x.innerHTML=`${u(`h-4 w-4`)} Moving…`;try{let e=await r(`/api/gallery/move`,{method:`POST`,body:{items:n.map(e=>({filename:e.filename,subfolder:e.subfolder||``,type:e.type||``,prompt_id:e.prompt_id}))}}),t=[];e?.moved&&t.push(`${e.moved} file${e.moved===1?``:`s`} moved`),e?.deleted_history&&t.push(`${e.deleted_history} history entr${e.deleted_history===1?`y`:`ies`} removed`),e?.failed&&t.push(`${e.failed} entr${e.failed===1?`y`:`ies`} could not be completed`),m(t.length?`${t.join(`, `)}.`:`Move complete.`,e?.failed?`warning`:`success`),c.clear(),await j()}catch(e){m(t(e),`error`)}finally{x.disabled=d||c.size===0,S()}}}async function A(){if(d||!c.size)return;let e=s.filter(e=>c.has(ge(e)));if(!e.length){c.clear(),S();return}let n=new Set(e.filter(e=>e.prompt_id).map(e=>e.prompt_id)),i=e.filter(e=>e.type===`local`).length,a=`Delete ${e.length} selected item${e.length===1?``:`s`}?`;if(n.size&&(a+=` This removes ${n.size} ComfyUI history ${n.size===1?`entry`:`entries`}; all outputs from those entries are removed.`),i&&(a+=` ${i} local media file${i===1?``:`s`} will be permanently deleted from the media folder.`),await g(a,{title:`Delete selected media?`,confirmLabel:`Delete`,danger:!0})){v.disabled=!0,v.innerHTML=`${u(`h-4 w-4`)} Deleting…`;try{let t=await r(`/api/gallery/delete`,{method:`POST`,body:{items:e.map(e=>({filename:e.filename,subfolder:e.subfolder||``,type:e.type||``,prompt_id:e.prompt_id||``}))}}),n=[];t?.deleted_history&&n.push(`${t.deleted_history} history ${t.deleted_history===1?`entry`:`entries`}`),t?.deleted_local&&n.push(`${t.deleted_local} local ${t.deleted_local===1?`file`:`files`}`),m(n.length?`Deleted ${n.join(` and `)}.`:`Deleted selected items.`,`success`),c.clear(),await j()}catch(e){m(t(e),`error`)}finally{v.disabled=d||c.size===0,S()}}}async function j(){if(!d){d=!0,c.clear(),S(),_.disabled=!0,_.innerHTML=`${u(`h-4 w-4`)} Loading`,f.innerHTML=T();try{s=(await r(`${a.endpoint}?limit=300`)).items||[],O()}catch(e){let n=t(e);f.innerHTML=`<div class="card p-6 text-center">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">${l(`alert`,`h-6 w-6`)}</div>
        <p class="text-sm font-semibold text-slate-100">Could not load ${i}</p>
        <p class="mx-auto mt-2 max-w-lg whitespace-pre-wrap text-xs leading-5 text-slate-400">${o(n)}</p>
        <button class="btn-secondary btn-xs mt-4" data-retry>Try again</button>
      </div>`,f.querySelector(`[data-retry]`)?.addEventListener(`click`,()=>{j()}),m(n,`error`)}finally{d=!1,_.disabled=!1,_.innerHTML=`${l(`refresh`,`h-4 w-4`)} Refresh`,S()}}}return _.addEventListener(`click`,()=>{j()}),x.addEventListener(`click`,()=>{k()}),v.addEventListener(`click`,()=>{A()}),await j(),()=>{}}async function Se(e){e.innerHTML=`
    <div class="mx-auto max-w-2xl space-y-5">
      <section class="card">
        <div class="card-header">
          <div class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300">${l(`cpu`,`h-4 w-4`)}</span>
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
            <button type="button" class="btn-secondary" data-unload-models>${l(`cpu`,`h-4 w-4`)} Unload Models</button>
            <button type="button" class="btn-secondary" data-free-memory>${l(`sparkles`,`h-4 w-4`)} Free Memory</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <div class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300">${l(`trash`,`h-4 w-4`)}</span>
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
          <button type="button" class="btn-danger" data-clear>${l(`trash`,`h-4 w-4`)} Clear History</button>
        </div>
      </section>
    </div>
  `;async function n(e,n,{busyLabel:i,successMessage:a,confirm:o,body:s}){if(!o||await g(o.message,o.options)){_(e,!0,i);try{m((await r(n,{method:`POST`,body:s}))?.status||a,`success`)}catch(e){m(t(e),`error`)}finally{_(e,!1)}}}let i=e.querySelector(`[data-unload-models]`);i?.addEventListener(`click`,()=>{n(i,`/free`,{busyLabel:`Unloading…`,successMessage:`Models unloaded.`,body:{unload_models:!0,free_memory:!1}})});let a=e.querySelector(`[data-free-memory]`);a?.addEventListener(`click`,()=>{n(a,`/free`,{busyLabel:`Freeing…`,successMessage:`Memory freed.`,body:{unload_models:!1,free_memory:!0}})});let o=e.querySelector(`[data-clear]`);return o?.addEventListener(`click`,()=>{n(o,`/history`,{busyLabel:`Clearing…`,successMessage:`History cleared.`,confirm:{message:`This removes every entry from ComfyUI's generation history. Generated files on disk are not deleted.`,options:{title:`Clear history?`,confirmLabel:`Clear History`,danger:!0}}})}),()=>{}}var X=[{key:`generate`,label:`Generate`,title:`Generate`,subtitle:`Customize and run a ComfyUI workflow.`,icon:`generate`,render:ae},{key:`chat`,label:`Chat`,title:`Chat`,subtitle:`Talk to a local GGUF model served by llama-server.`,icon:`chat`,render:fe},{key:`tts`,label:`Text to Speech`,title:`Text to Speech`,subtitle:`Generate speech and manage cloned voices with audio.cpp.`,icon:`mic`,render:pe},{key:`images`,label:`Image Gallery`,title:`Image Gallery`,subtitle:`Browse images generated by ComfyUI.`,icon:`image`,render:(e,t)=>xe(e,t,`images`)},{key:`audio`,label:`Audio Gallery`,title:`Audio Gallery`,subtitle:`Browse audio generated by ComfyUI.`,icon:`music`,render:(e,t)=>xe(e,t,`audio`)},{key:`videos`,label:`Video Gallery`,title:`Video Gallery`,subtitle:`Browse videos generated by ComfyUI.`,icon:`film`,render:(e,t)=>xe(e,t,`videos`)},{key:`other`,label:`Other`,title:`Other`,subtitle:`Utilities and maintenance.`,icon:`settings`,render:Se}],Z={boot:null,page:null,cleanup:null,comfyBusy:!1,chatBusy:!1,audioBusy:!1};function Q(e){return document.getElementById(e)}function $(e){let t=Q(e);if(!t)throw Error(`Missing element #${e}`);return t}function Ce(){return document.documentElement.classList.contains(`light`)}function we(){let e=Q(`theme-toggle`);if(!e)return;let t=Ce();e.innerHTML=l(t?`sun`:`moon`,`h-5 w-5`),e.title=t?`Switch to dark theme`:`Switch to light theme`,e.setAttribute(`aria-label`,t?`Switch to dark theme`:`Switch to light theme`);let n=document.querySelector(`meta[name="theme-color"]`);n&&(n.content=t?`#f8fafc`:`#070a12`)}function Te(e,t=!0){if(document.documentElement.classList.toggle(`light`,e),t)try{localStorage.setItem(`opensail.theme`,e?`light`:`dark`)}catch{}we()}function Ee(){Te(!Ce())}function De(){let e=window.matchMedia(`(prefers-color-scheme: light)`),t=e=>{let t=null;try{t=localStorage.getItem(`opensail.theme`)}catch{t=null}t||Te(e.matches,!1)};e.addEventListener?e.addEventListener(`change`,t):e.addListener(t)}var Oe={get boot(){return Z.boot},api:r,toast:m,refreshStatus:()=>Be(),navigate:e=>{window.location.hash=`#${e}`}};function ke(){let e=(window.location.hash||`#generate`).replace(/^#/,``);return X.find(t=>t.key===e)??X[0]}function Ae(){let e=Q(`nav-list`);if(!e)return;let t=ke();e.innerHTML=X.map(e=>`
      <a href="#${e.key}" class="nav-link group ${e.key===t.key?`nav-link-active`:``}" data-route="${e.key}">
        <span class="nav-icon">${l(e.icon,`h-[18px] w-[18px]`)}</span>
        <span class="min-w-0 flex-1 truncate">${e.label}</span>
        ${e.key===t.key?`<span class="h-1.5 w-1.5 rounded-full bg-accent-400"></span>`:``}
      </a>
    `).join(``)}function je(e){let t=Q(`sidebar`),n=Q(`mobile-overlay`);t?.classList.toggle(`-translate-x-full`,!e),n?.classList.toggle(`hidden`,!e)}async function Me(){let e=ke();if(Z.page===e.key&&Z.cleanup!==null)return;Z.cleanup?.(),Z.cleanup=null,Z.page=e.key,Ae(),$(`page-title`).textContent=e.title,$(`page-subtitle`).textContent=e.subtitle,je(!1);let n=$(`main`);n.innerHTML=`
    <div class="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-slate-500">
      ${u(`h-7 w-7`)}
      <p class="text-xs font-medium uppercase tracking-wider">Loading ${e.label.toLowerCase()}…</p>
    </div>
  `;try{let t=await e.render(n,Oe);Z.cleanup=typeof t==`function`?t:()=>{}}catch(e){console.error(e),n.innerHTML=`
      <div class="card mx-auto mt-10 max-w-lg p-6 text-center">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">
          ${l(`alert`,`h-6 w-6`)}
        </div>
        <h2 class="text-base font-semibold text-slate-100">Could not load this page</h2>
        <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">${t(e)}</p>
        <button class="btn-primary mt-5" id="page-retry">Try again</button>
      </div>
    `,n.querySelector(`#page-retry`)?.addEventListener(`click`,()=>{Z.cleanup=null,Z.page=null,Me()}),Z.cleanup=()=>{}}}var Ne={ok:{dot:`bg-emerald-400`,text:`text-emerald-300`},warn:{dot:`bg-amber-400`,text:`text-amber-300`},error:{dot:`bg-rose-400`,text:`text-rose-300`},idle:{dot:`bg-slate-500`,text:`text-slate-500`}};function Pe(e,{tone:t,label:n,detail:r,action:i=!1}){let a=Ne[t]||Ne.idle,o=Q(`${e}-dot`),s=Q(`${e}-badge`),c=Q(`${e}-detail`),l=Q(`${e}-unload`);o&&(o.className=`h-1.5 w-1.5 shrink-0 rounded-full ${a.dot}`),s&&(s.textContent=n,s.className=`ml-auto text-[11px] ${a.text}`),c&&r!==void 0&&(c.textContent=r),l&&(l.disabled=!i)}function Fe({connected:e,managed:t,configured:n}){let r=Q(`comfy-start`),i=Q(`comfy-stop`);if(!r||!i)return;r.disabled=Z.comfyBusy||e||t||!n,r.title=n?e||t?`ComfyUI is already running`:`Start ComfyUI`:`Set comfy_dir in configs/constants.json to start ComfyUI`,i.disabled=Z.comfyBusy||!t,i.title=t?`Stop the ComfyUI process started by OpenSail`:`ComfyUI was not started by OpenSail`;let a=`idle`,o=`Not configured`;e?(a=`ok`,o=`Connected`):t?(a=`warn`,o=`Starting…`):n&&(a=`error`,o=`Not running`),Pe(`comfy`,{tone:a,label:o});let s=Q(`comfy-badge`);s&&(s.title=e?t?`Started by OpenSail`:`Running outside OpenSail`:``)}function Ie({loaded:e,model:t}){Z.boot?.chat_models?.length?e?Pe(`chat`,{tone:`ok`,label:`Loaded`,detail:t||`Chat model loaded`,action:!Z.chatBusy}):Pe(`chat`,{tone:`idle`,label:`Idle`,detail:`No model loaded`}):Pe(`chat`,{tone:`idle`,label:`Not configured`,detail:`No chat models configured`})}function Le({loaded:e}){Z.boot?.tts_models?.length?e?Pe(`audio`,{tone:`ok`,label:`Running`,detail:`audio.cpp server`,action:!Z.audioBusy}):Pe(`audio`,{tone:`idle`,label:`Idle`,detail:`audio.cpp server stopped`}):Pe(`audio`,{tone:`idle`,label:`Not configured`,detail:`No speech models configured`})}function Re({connected:e=!1,managed:t=!1,unreachable:n=!1}={}){let r=Q(`connection-chip`);if(!r)return;let i=`bg-rose-400`,a=`ComfyUI offline`,o=`chip-danger`;n?a=`Server unreachable`:e?(i=`bg-emerald-400`,a=`ComfyUI connected`,o=`chip-success`):t&&(i=`bg-amber-400`,a=`ComfyUI starting`,o=`chip-warn`),r.className=`chip hidden sm:inline-flex ${o}`,r.innerHTML=`<span class="h-1.5 w-1.5 rounded-full ${i}"></span><span>${a}</span>`}function ze(){let e=Z.boot;e&&($(`comfy-url`).textContent=e.comfy_url||`Unknown`,Fe({connected:!!e.comfy_managed,managed:!!e.comfy_managed,configured:!!e.comfy_configured}),Ie({loaded:!!e.chat_loaded,model:e.chat_model}),Le({loaded:!!e.audio_loaded}))}async function Be(){try{let e=await r(`/api/status`),t=!!e.comfy,n=!!e.comfy_managed;Re({connected:t,managed:n}),Fe({connected:t,managed:n,configured:!!e.comfy_configured}),Ie({loaded:!!e.chat_loaded,model:e.chat_model}),Le({loaded:!!e.audio_loaded})}catch{Re({unreachable:!0}),Fe({connected:!1,managed:!1,configured:!!Z.boot?.comfy_configured})}}async function Ve(){let e=Q(`chat-unload`);Z.chatBusy=!0,_(e,!0,`Unloading…`);try{m((await r(`/api/chat/unload`,{method:`POST`})).status||`Chat model unloaded.`,`success`)}catch(e){m(t(e),`error`)}finally{Z.chatBusy=!1,_(e,!1),await Be()}}async function He(){let e=Q(`audio-unload`);Z.audioBusy=!0,_(e,!0,`Stopping…`);try{m((await r(`/api/audio/unload`,{method:`POST`})).status||`audio.cpp server stopped.`,`success`)}catch(e){m(t(e),`error`)}finally{Z.audioBusy=!1,_(e,!1),await Be()}}async function Ue(){let e=Q(`comfy-start`);Z.comfyBusy=!0,_(e,!0,`Starting…`);try{m((await r(`/api/comfy/start`,{method:`POST`})).status||`ComfyUI started.`,`success`)}catch(e){m(t(e),`error`)}finally{Z.comfyBusy=!1,_(e,!1),await Be()}}async function We(){let e=Q(`comfy-stop`);Z.comfyBusy=!0,_(e,!0,`Stopping…`);try{m((await r(`/api/comfy/stop`,{method:`POST`})).status||`ComfyUI stopped.`,`success`)}catch(e){m(t(e),`error`)}finally{Z.comfyBusy=!1,_(e,!1),await Be()}}async function Ge(){we(),De(),$(`theme-toggle`).addEventListener(`click`,Ee),$(`menu-button`).addEventListener(`click`,()=>je(!0)),$(`sidebar-close`).addEventListener(`click`,()=>je(!1)),$(`mobile-overlay`).addEventListener(`click`,()=>je(!1)),$(`comfy-start`).addEventListener(`click`,Ue),$(`comfy-stop`).addEventListener(`click`,We),$(`chat-unload`).addEventListener(`click`,Ve),$(`audio-unload`).addEventListener(`click`,He),window.addEventListener(`hashchange`,()=>{Z.cleanup?.(),Z.cleanup=null,Z.page=null,Me()});try{Z.boot=await r(`/api/bootstrap`)}catch(e){$(`main`).innerHTML=`
      <div class="card mx-auto mt-10 max-w-lg p-6 text-center">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">
          ${l(`alert`,`h-6 w-6`)}
        </div>
        <h2 class="text-base font-semibold text-slate-100">OpenSail could not start</h2>
        <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">${t(e)}</p>
        <button class="btn-primary mt-5" onclick="window.location.reload()">Reload</button>
      </div>
    `;return}Ae(),ze(),await Me(),Be(),setInterval(Be,3e4)}Ge();
//# sourceMappingURL=app.js.map