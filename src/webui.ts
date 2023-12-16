import {compose,log_all,codes,http_action_t, SimpleServerResponse, CompleteIncomingMessage} from 'danmaru';
import serveHandler from 'serve-handler'
import http  from 'http';
import { devices_get_device, enum_devices } from './devices';

const log=log_all();

const server= new http.Server();


function api_devices_list(req: CompleteIncomingMessage, resp: SimpleServerResponse): void  {
	const data={} as Record <string,unknown>;
	enum_devices((devid,status)=>{
		data[devid]=status;
	})
	resp.json_response(200,data);
}


function api_device_detail(req: CompleteIncomingMessage, resp: SimpleServerResponse): void  {
	const devid=req.full_url.searchParams.get('devid');
	if (devid==undefined) {
		resp.simple_response(400);
		return;
	}
	let dev=devices_get_device(devid);
	if (dev==undefined) {
		resp.simple_response(404);
		return;
	}

	resp.json_response(200,dev);
}

export const webui_actions:http_action_t[]=[
	{m:["GET"],prefix:"/api/devices_list",exact_match:true, do:api_devices_list},
	{m:["GET"],prefix:"/api/device_detail?",exact_match:false, do:api_device_detail}

];

compose(server,webui_actions,{
	indexer:(req,resp)=>{
	if (req.url.startsWith('/api/')) {
		log.info("unhandled api call at "+req.url);
		resp.simple_response(codes.NOT_FOUND);
		return;
	}
	serveHandler(req,resp,{public:"./static/", rewrites:[{source:'/',destination:'/index.html'}]});
	}
});

export function webui_start() {
	const webui_port=Number(process.env['PORT']??1234);

	server.listen(webui_port,()=>{
		log.mark(`danmaru HTTP server started at port ${webui_port}`);
	});
}