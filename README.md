# Micro Shelly

This is a example implementation of [real-time-events](https://shelly-api-docs.shelly.cloud/cloud-control-api/real-time-events) API offered from Shelly cloud

## Setup

* Obtain and setup OAuth Authentication code
* Create JS/TS code to handle device status events
* Issue control commands back to devices from your JS/TS code


## Obtaining OAuth Authentication code 

Production code should have a dedicated web service hosting to receive the web callbacks from
Shelly Cloud's OAuth grant page. For the purpose of this demo we suggest you register a account to 
http://pipedream.com and use their wonderful service RequestBin to "land" the web callback. If your RequestBin url is 

`https://some_random_string.m.pipedream.net`

you can visit 

`https://my.shelly.cloud/oauth_login.html?client_id=shelly-diy&redirect_uri=https://some_random_string.m.pipedream.net`

do the login and then you can extract the `code` from the RequestBin UI


## Runing the demo

Once you have the OAuth Authentication code:

* install dependencies `npm i`
* build `npm run build` or just `./tsc`
* configure `node . -a my_very_secret_auth_code`

at this point you can just run the demo with

`node .`

## Make it work for you

for expiration take a look at `src/ucode/example.ts` all it does is add some more console.log but you can see how to enumerate devices 
at startup, and how to hook to various events emitted  form parsed messages coming from the cloud. Any `.js` file in `build/ucode` get
loaded and `start()`ed after the demo initiates so you don't actually need typescript if you're not comfortable with it.


# HAVE FUN

