import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';

type Kind = 'categories'|'brands'|'tags'|'attributes'|'units';
const tables:Record<Kind,string>={categories:'catalog_categories',brands:'catalog_brands',tags:'catalog_tags',attributes:'catalog_attributes',units:'catalog_units'};
@Injectable()
export class CatalogService {
  constructor(private readonly db:DatabaseService) {}
  async list(kind:Kind){const table=tables[kind]; if(kind==='categories') return (await this.db.query(`SELECT c.*,p.name AS parent_name FROM ${table} c LEFT JOIN ${table} p ON p.id=c.parent_id ORDER BY c.sort_order,c.name`)).rows; return (await this.db.query(`SELECT * FROM ${table} ORDER BY name`)).rows;}
  async create(kind:Kind, data:Record<string,unknown>, actor:RequestUser){try{let sql='';let values:unknown[]=[]; if(kind==='categories'){sql='INSERT INTO catalog_categories(name,slug,parent_id,sort_order,status) VALUES($1,$2,$3,$4,$5) RETURNING *';values=[data.name,data.slug,data.parentId??null,data.sortOrder??0,data.status??'ACTIVE'];}else if(kind==='brands'){sql='INSERT INTO catalog_brands(name,slug,status) VALUES($1,$2,$3) RETURNING *';values=[data.name,data.slug,data.status??'ACTIVE'];}else if(kind==='tags'){sql='INSERT INTO catalog_tags(name,slug) VALUES($1,$2) RETURNING *';values=[data.name,data.slug];}else if(kind==='attributes'){sql='INSERT INTO catalog_attributes(name,code,input_type,required) VALUES($1,$2,$3,$4) RETURNING *';values=[data.name,data.code,data.inputType??'TEXT',data.required??false];}else{sql='INSERT INTO catalog_units(name,code) VALUES($1,$2) RETURNING *';values=[data.name,data.code];}const result=await this.db.query<{id:string}>(sql,values);await this.db.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)',[actor.id,`catalog.${kind}.created`,kind,result.rows[0].id]);return result.rows[0];}catch(error:unknown){if((error as {code?:string}).code==='23505')throw new ConflictException('Bu kayıt veya kod zaten var');throw error;}}
}
