const apiTarget=(process.env.TREX_API_URL??process.env.NEXT_PUBLIC_API_URL??'https://trex-api-staging.onrender.com/v1').replace(/\/$/,'');
if(!/^https?:\/\//.test(apiTarget))throw new Error('TREX_API_URL Tam Bir API Adresi Olmalı');
const buildDirectory=process.env.TREX_BUILD_DIR;
if(buildDirectory&&!/^\.next-[a-z0-9-]+$/.test(buildDirectory))throw new Error("Geçersiz Derleme Klasörü");
export default {
 ...(buildDirectory?{distDir:buildDirectory}:{}),
 async redirects(){return [{source:'/',destination:'/giris',permanent:false}];},
 async rewrites(){return [{source:'/v1/:path*',destination:`${apiTarget}/:path*`}];},
 async headers(){return [{source:'/:path*',headers:[
  {key:'Cache-Control',value:'private, no-store, max-age=0'},
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'X-Frame-Options',value:'DENY'},
  {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
  {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
  {key:'Strict-Transport-Security',value:'max-age=31536000; includeSubDomains'},
  {key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"}
 ]}];}
};
