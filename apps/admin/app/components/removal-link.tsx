"use client";
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import styles from './removal.module.css';
export function RemovalLink({href,children}:{href:string;children:React.ReactNode}){const[allowed,setAllowed]=useState(false);useEffect(()=>{void api<{user:{role:string}}>('/auth/me').then(me=>setAllowed(me.user.role==='SUPER_ADMIN')).catch(()=>setAllowed(false));},[]);return allowed?<Link className={styles.entry} href={href}>{children}</Link>:null;}
