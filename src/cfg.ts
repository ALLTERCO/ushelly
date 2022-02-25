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

import fs from 'fs';
export interface cfg_t extends Record<string,unknown>  {
	auth_code:string;
	access_token?:string;
}

function construct_cfg():cfg_t {
	return {
		auth_code:""
	}
}
const cfg_filename='./.cfg';
let the_cfg:cfg_t|undefined;

//throws on error!
export function cfg_get(for_setup:boolean=false):cfg_t{
	if (the_cfg) return the_cfg;
	let a_cfg
	try {
		a_cfg=JSON.parse(fs.readFileSync(cfg_filename,"utf8"));
	} catch (err) {
		if (!for_setup) throw err;
		the_cfg=construct_cfg();
		return the_cfg;
	}
	if(typeof(a_cfg)!='object' || a_cfg==null) {
		if (for_setup) {
			the_cfg=construct_cfg();
			return the_cfg;
		} else {
			throw new Error('.cfg does not parse to object?');
		}
	}
	if (typeof(a_cfg.auth_code)!='string') {
		if (for_setup) {
			the_cfg=construct_cfg();
			return the_cfg;
		} else {
			throw new Error('.cfg does not have a string at .auth_code');
		}
	}
	return the_cfg=a_cfg;
}

//throws on error!
export function cfg_save() {
	if (the_cfg==undefined) return;
	fs.writeFileSync(cfg_filename,JSON.stringify(the_cfg));
}
