const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const controls={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/async-controls.ts'),'utf8')),controls);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const profile={configured:true,grants:['ORDERS.VIEW'],resources:[['ORDERS','Siparişler']],actions:[['VIEW','Gör'],['EDIT','Düzenle']]};
function mount(){
 const values=[],refs=[],effects=[],requests=[];let stateIndex=0,refIndex=0,closed=0;
 const react={useState(initial){const i=stateIndex++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],value=>values[i]=typeof value==='function'?value(values[i]):value];},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial});},useEffect:effect=>effects.push(effect)};
 const box={exports:{},Error,require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};if(name==='../lib/async-controls')return controls.exports;if(name==='../lib/api')return {api:(route,init)=>new Promise((resolve,reject)=>requests.push({route,init,resolve,reject}))};throw Error(name);}};
 vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/personel/access-editor.tsx'),'utf8')),box);
 const render=(disabled=false)=>{stateIndex=0;refIndex=0;return box.exports.AccessEditor({userId:'staff-1',email:'staff@example.test',disabled,onClose:()=>closed++});};
 render();const cleanup=effects.shift()();return {values,requests,render,cleanup,get closed(){return closed;}};
}
function nodes(tree,type){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(child=>nodes(child,type));return [...(tree.type===type?[tree]:[]),...nodes(tree.props?.children,type)];}
function button(tree,label){return nodes(tree,'button').find(node=>node.props.children===label);}
async function main(){
 const app=mount();assert.equal(app.requests[0].route,'/admin/access/staff-1');
 assert(button(app.render(),'Düzenlemeyi Kapat'),'Loading editor can be closed');
 app.requests[0].reject(new Error('offline'));await flush();let tree=app.render();
 assert.equal(button(tree,'Yetkileri Kaydet'),undefined);button(tree,'Düzenlemeyi Kapat').props.onClick();assert.equal(app.closed,1);
 button(tree,'Yetkileri Yeniden Yükle').props.onClick();app.requests[1].resolve(profile);await flush();tree=app.render();
 const edit=nodes(tree,'input').find(node=>node.props['aria-label']==='Siparişler · Düzenle');edit.props.onChange({target:{checked:true}});
 assert(app.values[1].includes('ORDERS.EDIT'));assert(app.values[1].includes('ORDERS.VIEW'));
 tree=app.render();const save=button(tree,'Yetkileri Kaydet');save.props.onClick();save.props.onClick();
 assert.equal(app.requests.length,3,'Immediate repeated clicks send only one permission write');
 assert.equal(app.requests[2].init.method,'PUT');assert(JSON.parse(app.requests[2].init.body).grants.includes('ORDERS.EDIT'));
 edit.props.onChange({target:{checked:false}});assert(app.values[1].includes('ORDERS.EDIT'),'A stale checkbox handler cannot edit an in-flight save');
 app.requests[2].reject(new Error('Save failed'));await flush();tree=app.render(true);
 assert(nodes(tree,'input').every(node=>node.props.disabled));button(tree,'Yetkileri Kaydet').props.onClick();assert.equal(app.requests.length,3,'A stale account list disables permission saves');
 assert(app.values[1].includes('ORDERS.EDIT'),'Refreshing the parent account list preserves the permission draft');
 tree=app.render();assert.equal(button(tree,'Yetkileri Kaydet').props.disabled,false);
 button(tree,'Yetkileri Kaydet').props.onClick();const before=app.values[2];app.cleanup();app.requests[3].resolve({});await flush();
 assert.equal(app.values[2],before,'Closed editors ignore late save confirmations');
 const closing=mount();closing.cleanup();closing.requests[0].resolve(profile);await flush();assert.equal(closing.values[0],null,'Closed editors ignore late permission loads');
 console.log('Staff access editor passed: closable loading/failure, load retry, retained grants, duplicate-save lock, frozen in-flight changes and disposed responses.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
