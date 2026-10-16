'use client';
import {useEffect,useState} from 'react';
import {Download,Check} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {t} from '@/lib/i18n';
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
export function InstallApp(){
 const [pending,setPending]=useState<InstallEvent|null>(null),[installed,setInstalled]=useState(false),[help,setHelp]=useState(false),[web,setWeb]=useState(false);
 useEffect(()=>{const media=matchMedia('(display-mode: standalone)');const detect=()=>{const app=media.matches||matchMedia('(display-mode: fullscreen)').matches||!!(navigator as Navigator&{standalone?:boolean}).standalone||document.referrer.startsWith('android-app://');setInstalled(app);setWeb(!app);};detect();const ready=(e:Event)=>{e.preventDefault();setPending(e as InstallEvent);};const done=()=>{setInstalled(true);setPending(null);};window.addEventListener('beforeinstallprompt',ready);window.addEventListener('appinstalled',done);media.addEventListener('change',detect);return()=>{window.removeEventListener('beforeinstallprompt',ready);window.removeEventListener('appinstalled',done);media.removeEventListener('change',detect);};},[]);
 if(!web||installed)return null;
 return <><a className="secondary install-button" href="/downloads/mi-ministerio-0.3.1-beta.apk" download><Download size={16}/><span>{t('download_apk')}</span></a><button className="secondary install-button" disabled={installed} onClick={async()=>{if(!pending){setHelp(true);return;}try{await pending.prompt();await pending.userChoice;setPending(null);}catch{setPending(null);setHelp(true);}}}>{installed?<Check size={16}/>:<Download size={16}/>}<span>{t(installed?'install_done':'install_button')}</span></button><Dialog open={help} onOpenChange={setHelp}><DialogContent className="modal"><DialogTitle>{t('install_title')}</DialogTitle><DialogDescription>{t('install_intro')}</DialogDescription><p>{t('install_android')}</p><p>{t('install_ios')}</p><p className="muted">{t('install_limit')}</p><button className="primary" onClick={()=>setHelp(false)}>{t('install_close')}</button></DialogContent></Dialog></>;
}
