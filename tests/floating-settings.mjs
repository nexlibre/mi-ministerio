import ts from 'typescript';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Render the isolated prototype. This does not substitute for Android tests.
const dir=await mkdtemp('.floating-settings-test-');
try {
 const source=await readFile('components/ministerio/floating-settings.tsx','utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const file=dir+'/component.mjs';await writeFile(file,js);
 const {FloatingSettings,defaultFloatingOptions,normalizeFloatingOptions}=await import(pathToFileURL(process.cwd()+'/'+file));
 assert.deepEqual(normalizeFloatingOptions(null),defaultFloatingOptions);
 assert.deepEqual(normalizeFloatingOptions({style:100,alpha:-1,scale:2,activeColor:'evil',pausedColor:null}),{...defaultFloatingOptions,style:3,alpha:80,scale:1.35});
 assert.deepEqual(normalizeFloatingOptions({style:NaN,alpha:'1',scale:Infinity,activeColor:'#123ABC'}),{...defaultFloatingOptions,activeColor:'#123ABC'});
 const base={options:defaultFloatingOptions,enabled:false,visible:false,connected:true,ready:true,prepared:true,packageName:'com.pablormlopez.miministerio.testing',token:'62e87a04-f531-4bb0-8f90-53ce606334db',armed:true,busy:false,onPrepare(){},onDisable(){},onOptions(){}};
 const render=overrides=>renderToStaticMarkup(React.createElement(FloatingSettings,{...base,...overrides}));
 const html=render({});assert.match(html,/intent:\/\/floating-enable/);for(const name of ['Cristal','Oscuro','Claro','Minimalista'])assert.ok(html.includes(name));
 for(const invalid of [{connected:false},{ready:false},{armed:false},{busy:true},{packageName:'malicious;S.extra=1'},{token:'bad;end'}]) {
  const result=render(invalid);assert.doesNotMatch(result,/href="intent:/);assert.match(result,/aria-disabled="true"/);
 }
 const off=render({prepared:false});assert.match(off,/Activar cronómetro flotante/);assert.doesNotMatch(off,/Continuar y conceder permiso/);
 assert.match(render({enabled:true,visible:false}),/Mostrar ventana/);
 console.log('PASS: isolated settings prototype restricts activation links and renders all four styles.');
} finally {await rm(dir,{recursive:true,force:true});}
