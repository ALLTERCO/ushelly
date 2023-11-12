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

import { EventEmitter } from "stream";
import { push_command_req } from "./app";
import { shelly_status_dev_t, shelly_commandrequest_t } from "./shelly_types";

const devices=new Map<string,shelly_status_dev_t>();
export function devices_get_device(deviceid:string):shelly_status_dev_t|undefined {
	return devices.get(deviceid);
}
export function enum_devices(cb:(dvid:string,status:shelly_status_dev_t)=>void){
	for (const [devid,status] of devices) cb(devid,status);
}

let emiter=new EventEmitter();
function emiter_emit(event:string,...params:any[]){
	console.log("emiter_emit:",event);
	emiter.emit(event,...params);
}

export function devices_get_emiter():EventEmitter{
	return emiter;
}

export function devices_new(dev:shelly_status_dev_t) {
	let devid=(dev._dev_info.id[0]=="X"? dev._dev_info.id: String(parseInt(<string>dev._dev_info.id,16)));
	if (devices.has(devid)) return devices_status_report(devid,dev);
	console.log("devices_new devid: "+devid+" ( "+dev._dev_info.id+" ) code: "+dev._dev_info.code);
	devices.set(devid,dev);
}

export function devices_status_report(devid: string, dev: shelly_status_dev_t) {
	let old_dev=devices.get(devid);
	if (old_dev==undefined) {
		devices.set(devid,dev);
		return;
	}

	if (old_dev.serial==dev.serial) {
		emiter_emit(devid+'.*ping');
		emiter_emit('*any.*ping',devid);
		return;
	}
	if (walk(String(devid),dev,old_dev)){
		emiter_emit(devid+'.*any',devid+'.*any',dev,old_dev);
	}
}

//return true if any change
function walk(pref:string,new_obj:unknown,base_obj:unknown):boolean {
	if (typeof(new_obj)!='object' || new_obj==null) return false;
	if (typeof(base_obj)!='object' || base_obj==null) return false;
	
	let changes=false;
	if (Array.isArray(new_obj)) {
		//aray walk
		if (!Array.isArray(base_obj)) return false;
		if (new_obj.length!=base_obj.length) return false;
		for (let k=0; k<new_obj.length ; k++) {
			let res=compare(new_obj[k],base_obj[k]);
			let walked=false;
			if (res==compare_walk) {
				walked=true;
				if (walk(pref+'['+k+']',new_obj[k],base_obj[k])) {
					res=compare_neq;
				} else {
					res=compare_eq;
				}
			}
			if (res==compare_neq) {
				changes=true;
				if (!walked) {
					let old_v=base_obj[k];
					base_obj[k]=new_obj[k];
					emiter_emit(pref+'['+k+']',pref+'['+k+']',base_obj[k],old_v);
				} else {
					emiter_emit(pref+'['+k+'].*any',pref+'['+k+'].*any',new_obj[k]);
				}
			}
		}
	} else {
		//object walk
		for (let k in new_obj) if (new_obj.hasOwnProperty(k)) {
			let res:ReturnType<typeof compare>= compare_neq;
			let walked=false;
			if (base_obj.hasOwnProperty(k)){
				res=compare((<any>new_obj)[k],(<any>base_obj)[k]);
				if (res==compare_walk) {
					walked=true;
					if (walk(pref+'.'+k,(<any>new_obj)[k],(<any>base_obj)[k])) {
						res=compare_neq;
					} else {
						res=compare_eq;
					}
				}
			}
			if (res==compare_neq) {
				changes=true;
				if (!walked) {
					let old_v=(<any>base_obj)[k];
					(<any>base_obj)[k]=(<any>new_obj)[k];
					emiter_emit(pref+'.'+k,pref+'.'+k,(<any>base_obj)[k],old_v);
				} else {
					emiter_emit(pref+'.'+k+'.*any',pref+'.'+k+'.*any',(<any>base_obj)[k]);
				}
			}
		}
	}

	return changes;
}

const compare_eq=0;
const compare_neq=1;
const compare_walk=2; 

function compare(a:unknown,b:unknown): typeof compare_eq| typeof compare_neq|typeof compare_walk {
	if (a===b) {
		if (a===null || typeof(a)!='object') return compare_eq;
		return compare_walk;
	}
	if ( typeof(a)=='object') return compare_walk;
	return compare_neq
}



export function devices_online_report(devid: string, isonline: boolean) {
	emiter_emit(devid+'.*online',isonline);
	emiter_emit('*any.*online',devid,isonline);
}

let trid_src=10;
export type result_cb_t=(timeouted:boolean, res:Record<string, unknown>)=>void;
export interface pending_cb_t {
	ttl:number;
	cb:result_cb_t;
}

let req_callbacks=new Map<number,pending_cb_t>();
let req_callbacks_tick:NodeJS.Timeout|undefined;

function req_callbacks_check() {
	if (req_callbacks.size==0) {
		if (req_callbacks_tick) clearInterval(req_callbacks_tick);
		req_callbacks_tick=undefined;
		return;
	}
	const now=Date.now();
	for(let [trid,pcb] of req_callbacks) {
		if (pcb.ttl<now) {
			pcb.cb(true,{})
			req_callbacks.delete(trid);
		}
	}
	if (req_callbacks.size==0) {
		if (req_callbacks_tick) clearInterval(req_callbacks_tick);
		req_callbacks_tick=undefined;
	}
}


export function devices_commandresponse_report(devid: string, trid: number, data: Record<string, unknown>) {
	const pcb=req_callbacks.get(trid);
	if (pcb) {
		console.log("devices_commandresponse_report trid "+trid+" got a cb .. calling...");
		req_callbacks.delete(trid);
		if (req_callbacks.size==0) {
			if (req_callbacks_tick) clearInterval(req_callbacks_tick);
			req_callbacks_tick=undefined;
		}
		pcb.cb(false,data);
	} else {
		console.log("devices_commandresponse_report but trid "+trid+" not pending");
	}
}

function register_callback(trid:number, result_cb:result_cb_t) {
	req_callbacks.set(trid,{
		ttl:Date.now()+5000,
		cb:result_cb
	})
	if (req_callbacks_tick==undefined) {
		req_callbacks_tick=setInterval(req_callbacks_check,500);
	}
}

export function devices_relay_turn(devid:number,channel:number,state:boolean|string, result_cb?:result_cb_t) {
	
	if(typeof(state)=='boolean') state=(state?"on":"off");

	let tosend:shelly_commandrequest_t={
		"event":"Shelly:CommandRequest",
		"trid":trid_src++,
		"deviceId":devid,
		"data":{
		  "cmd":"relay",
		  "params":{
			 "turn":state,
			 "id":channel
		  }
		}
	}

	if (trid_src>10000) trid_src=10;
	if (result_cb) register_callback(tosend.trid,result_cb);
	push_command_req(tosend);

}


export function devices_light_turn(devid:number, channel:number,state:boolean|string, result_cb?:result_cb_t) {
	
	if(typeof(state)=='boolean') state=(state?"on":"off");

	let tosend:shelly_commandrequest_t={
		event: 'Shelly:CommandRequest',
		trid: trid_src++,
		deviceId: devid,
		data: {
			cmd: 'light',
			params: {
				turn: state, 
				id:channel
			}
		}
	};

	if (trid_src>10000) trid_src=10;
	if (result_cb) register_callback(tosend.trid,result_cb);
	push_command_req(tosend);
}

function clamp(a:number,min:number,max:number):number {
	if (a<min) return min
	if (a>max) return max;
	return a;
}

export function devices_light_brightnes(devid:number,channel:number, value:unknown,result_cb?:result_cb_t) {
	let tosend:shelly_commandrequest_t={
		event: 'Shelly:CommandRequest',
		trid: trid_src++,
		deviceId: devid,
		data: {
			cmd: 'light',
			params: {brightness: clamp(Number(value),0,100), id:channel}
		}
	};

	if (trid_src>10000) trid_src=10;
	if (result_cb) register_callback(tosend.trid,result_cb);
	push_command_req(tosend);
}


type valueF=()=>any;
function is_param_with_id(s:string, pname:string, params:Record<string,unknown>[],v:valueF,params_key?:string):boolean{
	let channel=-1; 
	if (s==pname) channel=0; //direct match set channel 0
	if (channel==-1 && s.startsWith(pname)) {
		//let leftover=s.substr(pname.length).trim();
		let leftover=s.substring(pname.length).trim();
		if (leftover=='') return false;
		let idx=Number(leftover);
		if (isNaN(idx) || idx<1)return false;
		channel=idx-1;
	}
	if (channel!=-1) {
		if (params_key==undefined) params_key=pname;
		let p=params[channel];
		if (p==undefined) {
			//create new params object, set proper id
			p={id:channel}; 
			params[channel]=p;
		}
		p[params_key]=v(); //set value, properly formated, in p
		return true;
	} 
	return false;
}

export function devices_light_setup(devid:number,options:unknown, result_cb?:result_cb_t) {
	if (!options || typeof(options)!='object' ) return ;

	let params:Record<string,unknown>[]=[];

	for (let k in options) if (options.hasOwnProperty(k)){
		let v=(<Record<string,unknown>>options)[k];
		if (k=='state' ) k='r1';
		if (k=='r' ) k='red1';

		if (is_param_with_id(k,'r',params,()=>String(v),'turn')) continue;
		if (is_param_with_id(k,'turn',params,()=>String(v))) continue;
		
		if (is_param_with_id(k,'mode',params,()=>String(v))) continue;

		if (is_param_with_id(k,'timeout',params,()=>Number(v))) continue;
		if (is_param_with_id(k,'red',params,()=>clamp(Number(v),0,255))) continue;
		if (is_param_with_id(k,'r',params,()=>clamp(Number(v),0,255),'red')) continue;
		if (is_param_with_id(k,'green',params,()=>clamp(Number(v),0,255))) continue;
		if (is_param_with_id(k,'g',params,()=>clamp(Number(v),0,255),'green')) continue;
		if (is_param_with_id(k,'blue',params,()=>clamp(Number(v),0,255))) continue;
		if (is_param_with_id(k,'b',params,()=>clamp(Number(v),0,255),'blue')) continue;
		if (is_param_with_id(k,'white',params,()=>clamp(Number(v),0,255))) continue;

		if (is_param_with_id(k,'gain',params,()=>clamp(Number(v),0,100))) continue;
		if (is_param_with_id(k,'brightness',params,()=>clamp(Number(v),0,100))) continue;

		if (is_param_with_id(k,'effect',params,()=>clamp(Number(v),0,6))) continue;

		if (is_param_with_id(k,'temp',params,()=>clamp(Number(v),2500,7500))) continue;
		
	}

	let reqs:shelly_commandrequest_t[]=[];
	let last_req:shelly_commandrequest_t|undefined;
	for (let p of params) {
		if (p==undefined) continue;
		last_req={
			event: 'Shelly:CommandRequest',
			trid: trid_src++,
			deviceId: devid,
			data: {
				cmd: 'light',
				params: p,
			}
		}
		reqs.push(last_req);
		if (trid_src>10000) trid_src=10;
	}
	if (last_req==undefined) return;
	if (result_cb) register_callback(last_req.trid,result_cb);
	for (let req of reqs) push_command_req(req);
}




export function devices_ir_emit(devid:number,data:string, result_cb?:result_cb_t){
	let tosend:shelly_commandrequest_t={
		event: 'Shelly:CommandRequest',
		trid: trid_src++,
		deviceId: devid,
		data: {
			cmd: 'ir_emit',
			params: {
				data: String(data),
				type:"stored"
			}
		}
	}

	if (trid_src>10000) trid_src=10;
	if (result_cb) register_callback(tosend.trid,result_cb);
	push_command_req(tosend);
}


export function devices_roller_go(devid:number, channel:number, go:string, duration?:number, result_cb?:result_cb_t) {
	let tosend:shelly_commandrequest_t={
		event: 'Shelly:CommandRequest',
		trid: trid_src++,
		deviceId: devid,
		data: {
			cmd: 'roller',
			params: {go: String(go), id:channel}
		}
	};
	if (duration!=undefined) tosend.data.params['duration']=duration;
	if (trid_src>10000) trid_src=10;
	if (result_cb) register_callback(tosend.trid,result_cb);
	push_command_req(tosend);
}


export function devices_roller_to_pos(devid:number, channel:number, pos:number, result_cb?:result_cb_t) {
	let tosend:shelly_commandrequest_t={
		event: 'Shelly:CommandRequest',
		trid: trid_src++,
		deviceId: devid,
		data: {
			cmd: 'roller_to_pos',
			params: {
				pos: clamp(Number(pos),0,100),
				id:channel
			}
		}
	};
	if (trid_src>10000) trid_src=10;
	if (result_cb) register_callback(tosend.trid,result_cb);
	push_command_req(tosend);
}
