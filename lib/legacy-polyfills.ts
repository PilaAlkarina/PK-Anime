/**
 * Small polyfills for Smart TV browsers on older Chromium (Samsung Tizen 4–6 ships 56–85),
 * inlined in <head> so they run before any app code. Syntax is handled by the browserslist in
 * package.json; these cover runtime APIs the bundle may call. Each one only fills a gap.
 * ResizeObserver and AbortController are inert stand-ins: features using them degrade instead
 * of crashing the page.
 */
export const LEGACY_POLYFILLS = `(function(){
var g=typeof globalThis!=="undefined"?globalThis:typeof self!=="undefined"?self:window;
if(typeof globalThis==="undefined"){g.globalThis=g;}
if(!Object.fromEntries){Object.fromEntries=function(it){var o={};Array.from(it,function(e){o[e[0]]=e[1];});return o;};}
if(!Array.prototype.flat){Object.defineProperty(Array.prototype,"flat",{configurable:true,writable:true,value:function(d){d=d===undefined?1:Math.floor(d);var r=[];(function f(a,l){for(var i=0;i<a.length;i++){if(Array.isArray(a[i])&&l>0)f(a[i],l-1);else r.push(a[i]);}})(this,d);return r;}});}
if(!Array.prototype.flatMap){Object.defineProperty(Array.prototype,"flatMap",{configurable:true,writable:true,value:function(fn,t){return this.map(fn,t).flat();}});}
if(!Array.prototype.at){Object.defineProperty(Array.prototype,"at",{configurable:true,writable:true,value:function(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;return this[n];}});}
if(!String.prototype.replaceAll){Object.defineProperty(String.prototype,"replaceAll",{configurable:true,writable:true,value:function(a,b){return a instanceof RegExp?this.replace(a,b):this.split(a).join(b);}});}
if(!Promise.allSettled){Promise.allSettled=function(ps){return Promise.all(Array.from(ps,function(p){return Promise.resolve(p).then(function(v){return{status:"fulfilled",value:v};},function(e){return{status:"rejected",reason:e};});}));};}
if(typeof queueMicrotask!=="function"){g.queueMicrotask=function(f){Promise.resolve().then(f);};}
if(typeof g.ResizeObserver!=="function"){g.ResizeObserver=function(){};g.ResizeObserver.prototype.observe=function(){};g.ResizeObserver.prototype.unobserve=function(){};g.ResizeObserver.prototype.disconnect=function(){};}
if(typeof g.AbortController!=="function"){g.AbortController=function(){this.signal={aborted:false,addEventListener:function(){},removeEventListener:function(){}};};g.AbortController.prototype.abort=function(){this.signal.aborted=true;};}
})();`;
