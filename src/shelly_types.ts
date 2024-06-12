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

export interface shelly_auth_code_token_t {
	sub:string;
	user_id:string,
	user_api_url:string;
}

export function is_shelly_auth_code_token(t:any) :t is shelly_auth_code_token_t {
	return (
		t && typeof(t)=='object'
		&& typeof(t.sub)=='string' && t.sub!='pwd'
		&& typeof(t.user_id)=='string'
		&& typeof(t.user_api_url)=='string'
	)
}


export interface shelly_access_token_t {
	sub:string;
	user_id:string,
	user_api_url:string;
	exp:number;
}

export function is_shelly_access_token_t(t:any) :t is shelly_access_token_t {
	return (
		t && typeof(t)=='object'
		&& typeof(t.sub)=='string' && t.sub=='pwd'
		&& typeof(t.user_id)=='string'
		&& typeof(t.user_api_url)=='string'
		&& typeof(t.exp)=='number'
	)
}

export interface shelly_generic_response_ok_t {
	isok:true;
	data:unknown;
}
export interface shelly_generic_response_err_t {
	isok:false;
	errors:unknown[];
}

export type  shelly_generic_response_t =  shelly_generic_response_ok_t| shelly_generic_response_err_t;

export function is_shelly_generic_response(r:any):r is shelly_generic_response_t {
	return (
		r && typeof(r)=='object' 
		&& typeof(r.isok)=='boolean'
	)
}

export function is_shelly_generic_response_ok(r:any):r is shelly_generic_response_ok_t {
	return (
		r && typeof(r)=='object' 
		&& r.isok===true
	)
}
export function is_shelly_generic_response_err(r:any):r is shelly_generic_response_err_t {
	return (
		r && typeof(r)=='object' 
		&& r.isok===false
		&& Array.isArray(r.errors)
	)
}


export interface shelly_generic_dev_info_t {
	gen:string,
	id: string,
	code: string,
	online: boolean,
}

export function is_shelly_generic_dev_info(i:any):i is shelly_generic_dev_info_t {
	if (!(i && typeof(i)=='object')) return false;
	if (typeof(i.id)=='number') i.id=String(i.id);

	return (
		typeof(i.gen)=='string'
		&& typeof(i.code)=='string'
		&& typeof(i.id)=='string'
		&& typeof(i.online)=='boolean'
	)
}

export interface shelly_status_miniamal_t {
	serial: number,
	[index:string]:unknown;
}
export function is_shelly_status_miniamal(s:any):s is shelly_status_miniamal_t{
	return (
		s && typeof(s)=='object'
		&& typeof(s.serial)=='number'
	)
}

export interface shelly_status_dev_t extends shelly_status_miniamal_t {
	_dev_info:shelly_generic_dev_info_t
}

let virtual_serial=1;
export function is_shelly_status_dev(s:any):s is shelly_status_dev_t{
	if (
		s && typeof(s)=='object' //don't use is_shelly_status_miniamal as some virtual devs don't have serial
		&& is_shelly_generic_dev_info(s['_dev_info'])
	) {
		if (s.serial==undefined) {
			s.serial=virtual_serial++;
			if (virtual_serial>10000) virtual_serial=1;
		}

		if (typeof(s.serial)!='number') {
			return false;
		}
		return true;
	}
	return false;
}

export function is_shelly_status_dev_map(m:any):m is Record<string,shelly_status_dev_t>{
	if (!(m && typeof(m)=='object')) return false;
	for (let k in m) if(m.hasOwnProperty(k)) {
		const dev=m[k];
		if (!is_shelly_status_dev(dev)) {
			console.log("is_shelly_status_dev_map fails:",m[k]);
			return false;
		}
	}
	return true;
}

export interface shelly_all_status_data_t {
	devices_status:Record<string,shelly_status_dev_t>;
}

export function is_shelly_all_status_data(d:any): d is shelly_all_status_data_t {
	return (
		d && typeof(d)=='object' 
		&& d.devices_status && typeof(d.devices_status)=='object'
		&& is_shelly_status_dev_map(d.devices_status)
	)
}


export interface shelly_event_dev_t {
	id: string,
	code: string,
	gen: string,
}

export function is_shelly_event_dev(d:any) :d is shelly_event_dev_t{
	return (
		d && typeof(d)=='object'
		&&typeof(d.id)=='string'
		&&typeof(d.code)=='string'
		&&typeof(d.gen)=='string'
	)
}
export interface shelly_statusonchange_t {
	event: 'Shelly:StatusOnChange',
	device: shelly_event_dev_t,
	status: shelly_status_miniamal_t;
}

export function is_shelly_statusonchange(m:any):m is shelly_statusonchange_t {
	return (
		m && typeof(m)=='object'
		&& m.event=='Shelly:StatusOnChange'
		&& is_shelly_event_dev(m.device)
		&& is_shelly_status_miniamal(m.status)
	)
}


export interface shelly_online_t {
	"event":"Shelly:Online",
	"device":shelly_event_dev_t,
	"online":number
}

export function is_shelly_online(m:any):m is shelly_online_t {
	return (
		m && typeof(m)=='object'
		&& m.event=='Shelly:Online'
		&& is_shelly_event_dev(m.device)
		&& typeof(m.online)=='number'
	)
}
//
//{"event":"Shelly:CommandResponse","trid":10,"user":6550,"deviceId":"12133370","data":{"isok":true}}
export interface shelly_commandresponse_t {
	"event":"Shelly:CommandResponse",
	"deviceId":string,
	"trid":number,
	"user":number,
	"data":Record<string,unknown>
}

export function is_shelly_commandresponse(m:any):m is shelly_commandresponse_t {
	return (
		m && typeof(m)=='object'
		&& m.event=='Shelly:CommandResponse'
		&& typeof(m.deviceId)=='string'
		&& typeof(m.trid)=='number'
		&& typeof(m.user)=='number'
		&& m.data && typeof(m.data)=='object'
	)
}


export function shelly_devid_hex(devid:string):string{
	if (devid[0]=='X') return devid;
	let res=Number(devid).toString(16).toLowerCase();
	if (res.length==6 || res.length==12) return res;

	if (res.length<6) {
		while(res.length<6) res='0'+res;
		return res;
	}
	if (res.length<12) {
		while(res.length<12) res='0'+res;
		return res;
	}
	return res;
}


export type shelly_commandrequest_t={
	"event":"Shelly:CommandRequest",
	"trid":number,
	"deviceId":string,
	"data":{
		cmd:string;
		params:Record<string,unknown>
	}
}
