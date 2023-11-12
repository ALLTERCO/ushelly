import { EventEmitter } from 'stream';
import {enum_devices} from '../devices'


function print_event (ev:string,st:unknown) {
    console.log(__filename+" print_event ev: %s st:%s",ev,JSON.stringify(st));
}


export function start(e:EventEmitter) {
    console.log(__filename+" start()!");
    enum_devices((devid,st)=>{
        console.log('================= enumerated device ',devid);
        console.log(st);
        e.on(devid+'.*any',print_event)
    });
}