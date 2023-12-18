/*

Copyright 2022 Allterco EOOD 

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { cfg_get, cfg_save } from "./cfg";
import JWT from 'jsonwebtoken';
import { is_shelly_access_token_t as is_shelly_access_token, is_shelly_auth_code_token } from "./shelly_types";
import fetch,{Response,RequestInit,BodyInit}  from 'node-fetch';

export {BodyInit} from 'node-fetch';

export interface oauth_params_t {
	auth_code:string;
	client_id:string;
	access_token:string;
	access_token_exp:number;
	user_api_url_pref:string;
	user_api_url:URL;
}
let p:oauth_params_t;
export function oauth_get_params():Promise<oauth_params_t> { 
	if (p && p.access_token_exp>Date.now()+10000) {
		console.log("reusing access token...");
		return Promise.resolve(p);
	}
	return new Promise(async (resolve,reject)=>{
		if (!p) {
			const cfg=cfg_get();
			const decoded=JWT.decode(cfg.auth_code);
			if (!is_shelly_auth_code_token(decoded)) {
				reject(new Error('auth code does not seem right! auth_code:'+cfg.auth_code));
				return;
			}
			p={
				user_api_url_pref:decoded.user_api_url,
				user_api_url:new URL(decoded.user_api_url),
				access_token:'',
				client_id:encodeURIComponent(decoded.sub),
				access_token_exp:0,
				auth_code:cfg.auth_code
			}
			if (cfg.access_token!=undefined) {
				const decoded=JWT.decode(cfg.access_token);
				if (is_shelly_access_token(decoded) && (decoded.exp*1000>Date.now()+10000)) {
					p.access_token=cfg.access_token;
					p.access_token_exp=decoded.exp*1000;
					console.log("restored access token...");
					return resolve(p);
				}
			}
		}

		try {
			console.log("refreshing access token...");
			let req=await fetch(p.user_api_url_pref+'/oauth/auth?client_id='+p.client_id+'&grant_type=code&code='+encodeURIComponent(p.auth_code));
			if (req.status!=200) {
				return reject(new Error("/oauth/auth faled code:"+req.status));
			}
			let resp=await req.json();
			if (resp && typeof(resp)=='object' && typeof resp.access_token=='string') {
				const decoded=JWT.decode(resp.access_token);
				if (!is_shelly_access_token(decoded)) {
					return reject(new Error("/oauth/auth returned invalid token:"+resp.access_token));
				}
				p.access_token=resp.access_token;
				p.access_token_exp=decoded.exp*1000;
				if (p.access_token_exp<Date.now()+10000) {
					return reject(new Error("/oauth/auth returned invalid (already expired) token:"+resp.access_token));
				}
				const cfg=cfg_get();
				cfg.access_token=p.access_token;
				
				try{
					cfg_save();
				} catch(ignore) {
				}

				return resolve(p);
			} else {
				return reject(new Error("/oauth/auth invalid payload:"+JSON.stringify(resp)));
			}
		} catch (err) {
			if (!(err instanceof Error)) err=new Error(String(err));
			return reject(err);
		}
	});
}

export function oauth_call(oap:oauth_params_t,suffix:string, body?:BodyInit, content_type?:string):Promise<Response>  {
	const init:RequestInit={};
	init.headers=<Record<string,string>>{} ;
	init.headers["Authorization"]= "Bearer "+oap.access_token;
	if (content_type!=undefined) init.headers["Content-type"]=content_type;

	if (body) {
		init.method="POST";
		init.body=body;
	}
	
	return fetch(oap.user_api_url_pref+suffix,init);
}
