import { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';

// Exercise the real HTTP middleware/response pipeline without opening a TCP listener.
export function requestInMemory(handler:RequestListener,input:{method:string;path:string;headers?:Record<string,string>;body?:string|Buffer}) {
  return new Promise<{status:number;headers:ReturnType<ServerResponse['getHeaders']>;body:Buffer;text:string}>((resolve,reject)=>{
    const socket=new Duplex({read(){},write(_chunk,_encoding,callback){callback();}});
    const req=new IncomingMessage(socket as never),res=new ServerResponse(req),chunks:Buffer[]=[];
    req.method=input.method;req.url=input.path;req.httpVersion='1.1';req.headers={...input.headers};
    const payload=input.body===undefined?null:Buffer.from(input.body);
    if(payload!==null)req.headers['content-length']=String(payload.length);
    const append=(value:unknown,encoding?:BufferEncoding)=>{if(value!==undefined&&value!==null)chunks.push(typeof value==='string'?Buffer.from(value,encoding):Buffer.from(value as Uint8Array));};
    const write=res.write,end=res.end;
    res.write=(function(this:ServerResponse,...args:unknown[]){append(args[0],typeof args[1]==='string'?args[1] as BufferEncoding:undefined);return Reflect.apply(write,this,args);}) as ServerResponse['write'];
    res.end=(function(this:ServerResponse,...args:unknown[]){if(typeof args[0]!=='function')append(args[0],typeof args[1]==='string'?args[1] as BufferEncoding:undefined);return Reflect.apply(end,this,args);}) as ServerResponse['end'];
    res.assignSocket(socket as never);
    const timer=setTimeout(()=>{socket.destroy();reject(Error('In-memory HTTP request timed out'));},5000);
    const fail=(error:Error)=>{clearTimeout(timer);socket.destroy();reject(error);};
    res.once('error',fail);socket.once('error',fail);
    res.once('finish',()=>{clearTimeout(timer);const body=Buffer.concat(chunks);const result={status:res.statusCode,headers:res.getHeaders(),body,text:body.toString('utf8')};res.detachSocket(socket as never);socket.destroy();resolve(result);});
    try{handler(req,res);req.complete=true;if(payload!==null)req.push(payload);req.push(null);}catch(error){fail(error instanceof Error?error:new Error(String(error)));}
  });
}
