const http = require('http');
const fs = require('fs');
const path = require('path');
const port = process.env.PORT || 10000;
const publicDir = path.join(__dirname, 'public');
function send(res,status,body,type='text/html; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN'});res.end(body)}
function file(name,res,type){fs.readFile(path.join(publicDir,name),(e,d)=>e?send(res,404,'Bulunamadı','text/plain; charset=utf-8'):send(res,200,d,type))}
http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/v1/health'||u.pathname==='/health') return send(res,200,JSON.stringify({success:true,data:{status:'ok',environment:'demo',version:'1.0.0-demo.1',payment_provider:'mock',shipping_provider:'mock'}}),'application/json; charset=utf-8');
 if(u.pathname==='/admin'||u.pathname==='/admin/') return file('admin.html',res);
 if(u.pathname==='/bayi'||u.pathname==='/bayi/') return file('dealer.html',res);
 if(u.pathname==='/styles.css') return file('styles.css',res,'text/css; charset=utf-8');
 return file('index.html',res);
}).listen(port,'0.0.0.0',()=>console.log('Trex demo listening',port));
