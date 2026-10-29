import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const native=JSON.parse(await readFile('android/assetlinks.json','utf8'));
const web=JSON.parse(await readFile('public/.well-known/assetlinks.json','utf8'));
for(const statement of native){
 const match=web.find(item=>item.target?.namespace===statement.target?.namespace&&item.target?.package_name===statement.target?.package_name);
 assert.ok(match,'The web file must preserve the native package association');
 for(const relation of statement.relation)assert.ok(match.relation.includes(relation),'Missing relation '+relation);
 for(const fingerprint of statement.target.sha256_cert_fingerprints)assert.ok(match.target.sha256_cert_fingerprints.includes(fingerprint),'Missing certificate fingerprint');
}
assert.ok(web.some(x=>x.target?.package_name==='com.pablormlopez.miministerio'&&x.relation.includes('delegate_permission/common.use_as_origin')));
console.log('PASS: prepared public Digital Asset Links preserve the original package and postMessage relation.');
