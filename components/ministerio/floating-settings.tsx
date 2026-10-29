'use client';

export type FloatingOptions={style:number;alpha:number;scale:number;activeColor:string;pausedColor:string};
export const defaultFloatingOptions:FloatingOptions={style:0,alpha:230,scale:1,activeColor:'#e8c56a',pausedColor:'#c6d3d8'};
type Props={options:FloatingOptions;enabled:boolean;visible:boolean;connected:boolean;ready:boolean;prepared:boolean;packageName:string;token:string;armed:boolean;busy:boolean;
 onPrepare:()=>void;onDisable:()=>void;onOptions:(options:FloatingOptions)=>void;};
export function FloatingSettings(p:Props){
 const validPackage=p.packageName==='com.pablormlopez.miministerio'||p.packageName==='com.pablormlopez.miministerio.testing';
 const validToken=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.token);
 const canActivate=p.connected&&p.armed&&p.ready&&!p.busy&&validPackage&&validToken;
 const url=canActivate?`intent://floating-enable#Intent;scheme=miministerio;package=${p.packageName};S.activationToken=${p.token};end`:undefined;
 const update=(v:Partial<FloatingOptions>)=>p.onOptions({...p.options,...v});
 return <section className="card floating-settings">
  <div className="section-title"><div><h2>Cronómetro flotante</h2><p className="muted">El mismo cronómetro de Actividad, visible sobre otras aplicaciones.</p></div></div>
  <p className="muted">{!p.connected?'Disponible en Mi Ministerio para Android con la conexión segura activa.':p.enabled?(p.visible?'Ventana visible':'Ventana oculta. El cronómetro conserva su estado.'):'Desactivado'}</p>
  <div className="button-row">
   {!p.enabled&&!p.prepared&&<button className="secondary" disabled={!p.connected||p.busy} onClick={p.onPrepare}>Activar cronómetro flotante</button>}
   {(!p.enabled&&p.prepared||p.enabled&&!p.visible)&&<a className="secondary" href={url} aria-disabled={!canActivate} onClick={e=>{if(!canActivate)e.preventDefault();}}>{p.enabled?'Mostrar ventana / conceder permiso':'Continuar y conceder permiso'}</a>}
   {p.enabled&&<button className="text-button" disabled={!p.connected||!p.ready||p.busy} onClick={p.onDisable}>Desactivar</button>}
  </div>
  {(p.enabled||p.prepared)&&<div className="floating-option-grid">
   <label>Estilo<select value={p.options.style} onChange={e=>update({style:Number(e.target.value)})}><option value={0}>Cristal</option><option value={1}>Oscuro</option><option value={2}>Claro</option><option value={3}>Minimalista</option></select></label>
   <label>Tamaño <span>{Math.round(p.options.scale*100)} %</span><input type="range" min="75" max="135" step="5" value={Math.round(p.options.scale*100)} onChange={e=>update({scale:Number(e.target.value)/100})}/></label>
   <label>Opacidad <span>{Math.round(p.options.alpha/255*100)} %</span><input type="range" min="80" max="255" step="5" value={p.options.alpha} onChange={e=>update({alpha:Number(e.target.value)})}/></label>
   <label>Color activo<input type="color" value={p.options.activeColor} onChange={e=>update({activeColor:e.target.value})}/></label>
   <label>Color pausado<input type="color" value={p.options.pausedColor} onChange={e=>update({pausedColor:e.target.value})}/></label>
  </div>}
  {(p.enabled||p.prepared)&&<p className="footnote">El dispositivo conserva sin cifrar solo el tiempo y los comandos pendientes para recuperarlos al volver; los datos de tu espacio permanecen cifrados.</p>}
 </section>;
}
