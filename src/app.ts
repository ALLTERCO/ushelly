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

import { devices_commandresponse_report, devices_get_emiter, devices_new, devices_online_report, devices_status_report } from "./devices";

//make sure emiter is created as early as possible
const emiter=devices_get_emiter();

import { cfg_get, cfg_save } from "./cfg";
import JWT from 'jsonwebtoken';
import { is_shelly_all_status_data, is_shelly_auth_code_token, is_shelly_generic_response, is_shelly_statusonchange, shelly_devid_hex, is_shelly_online, shelly_commandrequest_t, is_shelly_commandresponse, jrpc_call_cb, JrpcRequest_call, JrpcRequest, is_JrpcResponse } from "./shelly_types";
import { oauth_call, oauth_get_params } from "./oauth";
import {WebSocket} from 'ws';
import { webui_start } from './webui';

let ucode_filter:string[]=[];

let shush=false; 
export function app_shush():boolean {return shush};

let webui=true;
export function app_webui():boolean {return webui};


{
	let reconfigured=false;
	for (let p_next=2; p_next<process.argv.length; p_next++) {
		const p_name=process.argv[p_next];
		const p_value:string|undefined=process.argv[p_next+1];
		switch (p_name) {
			case '-a':
			case '--auth-code':{
				if (p_value==undefined) {
					console.log('param',p_name,'needs a value!');
					process.exit(-1);
				}
				let cur_cfg=cfg_get(true);
				const decoded=JWT.decode(p_value);
				if (!is_shelly_auth_code_token(decoded)) {
					console.log('auth code does not seem right!');
					process.exit(-1);
				}

				cur_cfg.auth_code=p_value;
				reconfigured=true;
				cfg_save();
				p_next++;
				break;
			};
			case '-u':
			case '--ucode':{
				if (p_value==undefined) {
					console.log('param',p_name,'needs a value!');
					process.exit(-1);
				}
				ucode_filter.push(p_value+'.js');
				p_next++;
				continue;
				break;
			}
			case '-q':{
				shush=true;
				continue;
				break;
			}
			case '--no-webui':
			case '--nowebui':
			case '--no-web-ui':
			case '--noweb-ui':
			case '--no-web':
			case '--noweb':{
				webui=false;
				continue;
				break;
			}
			default:{
				console.log('param',p_name,' ignored!');
			}
		}
	}
	if (reconfigured) {
		console.log('ushelly stops now as it was reconfigured! Restart with no params to use the new configuration!');
		process.exit();
	}

}

console.log('...preboot...');
let cfg;
try {
	cfg=cfg_get();
} catch (err) {
	console.log("config failed to load do you need to -a <access_code>?");
	process.exit(-2);
}

{
	const decoded=JWT.decode(cfg.auth_code);
	if (!is_shelly_auth_code_token(decoded)) {
		console.log('auth code does not seem right! auth_code:',cfg.auth_code);
		process.exit(-1);
	}
	console.log("configured with access for uid:"+decoded.user_id+" at server "+decoded.user_api_url);
}

function boot() {
	console.log("...boot...");
	oauth_get_params().then(async (oauth_params)=>{
		let raw_list;
		try {
			const req=await oauth_call(oauth_params,'/device/all_status?show_info=true&no_shared=true');
			raw_list=await req.json();
			//console.log("/device/all_status",JSON.stringify(raw_list,null,2));
			if (is_shelly_generic_response(raw_list) && raw_list.isok==true && is_shelly_all_status_data(raw_list.data)) {
				const devices_status=raw_list.data.devices_status;
				for (let k in devices_status) if (devices_status.hasOwnProperty(k)){
					const dev=devices_status[k];
					if (dev._dev_info.gen=='G1' || dev._dev_info.gen=='G2' || dev._dev_info.gen=='GBLE') devices_new(dev);
				}
				establish_event_link();
			} else {
				console.log("/device/all_status got unknown respose data! Will retry");
				setTimeout(boot,30000+Math.random()*30000);
				return;
			}
		} catch(err) {
			console.log("oauth_call to /device/all_status got err:",err);
			setTimeout(boot,30000+Math.random()*30000);
			return;
		}
	}).catch(err=>{
		console.log("get_oauth_params got err:",err," will retry...");
		setTimeout(boot,30000+Math.random()*30000);
		return;
	});
}

boot();
let is_bootime=true;
let events_ws:WebSocket|undefined;

let trid_ctr=1234; 
const trid_base='ushelly_'+Math.round(Math.random()*10000)+'_';

const pending_callbacks=new Map<string,{cb:jrpc_call_cb, tmo:number, d:string}>();

setInterval(()=>{
	const now=Date.now();
	for (let [trid,pending] of pending_callbacks) {
		if (pending.tmo<now){
			pending_callbacks.delete(trid);
			pending.cb({event:'Shelly:JrpcResponse',deviceId:pending.d,trid,response:{error:"Server Timeout"}});
		}
	}
},1000)

export function jrpc_call(call:JrpcRequest_call, cb:jrpc_call_cb){

	let trid=trid_base+(trid_ctr++);
	if (trid_ctr>10000000) trid_ctr=1234;

	if (events_ws==undefined) {
		console.log("Server Away");
		cb({event:'Shelly:JrpcResponse',deviceId:call.deviceId,trid,response:{error:"Server Away"}})
		return;
	}

	const req:JrpcRequest={...call,event:"Shelly:JrpcRequest", trid};
	pending_callbacks.set(trid,{cb,tmo:Date.now()+10000,d:call.deviceId});
	events_ws.send(JSON.stringify(req), (err)=>{
		if(err){
			console.log("Transport err:"+err);
			cb({event:'Shelly:JrpcResponse',deviceId:call.deviceId,trid,response:{error:"Transport err:"+err}})
		}
	})
}

function connection_lost (this: WebSocket, code: number, reason: Buffer) {
	console.log("...connection_lost...");
	if (this.readyState!=WebSocket.CLOSED) this.close();
	if (events_ws==this) {
		events_ws=undefined;
		setTimeout(establish_event_link,5000+Math.random()*5000);
	}
}

function new_event(this: WebSocket, raw_data: any, isBinary: boolean) {
	if (isBinary || this!=events_ws) {
		if (this.readyState!=WebSocket.CLOSED) this.close();
		return;
	}
	let msg;
	try{ 
		msg=JSON.parse(String(raw_data));
		//console.log("msg:",msg);
	} catch (err) {
		console.log("NON JSON MESSAGE?!");
		if (this.readyState!=WebSocket.CLOSED) this.close();
		return;
	}
	if (is_shelly_statusonchange(msg)) {
		const devid=msg.device.id;
		const devid_hex=shelly_devid_hex(devid);
		if (!shush) console.log("status for: ",devid,'(',devid_hex,')');
		return devices_status_report(devid,{...msg.status,_dev_info:{
			code:msg.device.code,
			gen:msg.device.gen,
			online:true,
			id:devid_hex,
		}});
	} else if (is_shelly_online(msg)) {
		const devid=msg.device.id;
		const devid_hex=shelly_devid_hex(devid);
		if (!shush) console.log("online indication for: ",devid,'(',devid_hex,')',msg.online!=0);
		return devices_online_report(devid,msg.online!=0);
	} else if (is_shelly_commandresponse(msg)) {
		const devid=msg.deviceId;
		const devid_hex=shelly_devid_hex(devid);
		if (!shush) console.log("command response for:",devid,'(',devid_hex,') trid:',msg.trid,"msg:",msg.data);
		return devices_commandresponse_report(devid,msg.trid,msg.data);
	} else if (is_JrpcResponse(msg)) {
		const pending=pending_callbacks.get(msg.trid);
		if (!pending) return;
		pending_callbacks.delete(msg.trid);
		pending.cb(msg);
	} else {
		console.log("unknown msg:",JSON.stringify(msg));
	}
}


function establish_event_link() {
	console.log("...establish_event_link...");
	oauth_get_params().then(async (oauth_params)=>{
		if (events_ws!=undefined) events_ws.close();
		events_ws=undefined;
		const xsok=new WebSocket('wss://'+oauth_params.user_api_url.hostname+':6113/shelly/wss/hk_sock?t='+encodeURIComponent(oauth_params.access_token));
		xsok.on("close",connection_lost);
		xsok.on("error",connection_lost);
		xsok.on("message",new_event);
		xsok.on("open",()=>{
			if (events_ws!=undefined){
				if (events_ws.readyState!=WebSocket.CLOSED) events_ws.close();
			}
			console.log("link established!");
			events_ws=xsok;
			if (is_bootime) {
				is_bootime=false;
				post_boot();
			}
		});
	}).catch(err=>{
		console.log("get_oauth_params got err:",err," will retry...");
		setTimeout(establish_event_link,30000+Math.random()*30000);
		return;
	});
}

function post_boot() {
	console.log("...post_boot...");
	
	if (webui) webui_start();

	fs.readdir(__dirname+ '/ucode/',(err,data)=>{
		if (err) {
			console.log("post_boot got err on reading ./ucode/ err:",err);
			process.exit(-4);
		}
		for (let f of data) {
			if (f.endsWith('.js')) {
				if (ucode_filter.length>0){
					if (ucode_filter.indexOf(f)==-1) {
						console.log("skipping ucode from "+__dirname+'/ucode/'+f);
						continue;
					}
				}
				console.log("loadig ucode from "+__dirname+'/ucode/'+f);
				const mod=require('./ucode/'+f);
				if(typeof(mod.start)=='function') {
					mod.start(emiter);
				} else if (typeof(mod.default)=='function') {
					mod.default();
				}
			} else {
				continue;
			}
		}
	})
}


export function push_command_req(req:shelly_commandrequest_t) {
	events_ws?.send(JSON.stringify(req));
}




