/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import EmailMessage from "./email";
import jwt from "./jwt";

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	kv: KVNamespace;
	CLOUDMAILIN_KEY: string;
	CLOUDFLARE_ORGANIZATION: string;
	DKIM_PRIVATE_KEY: string;
}


async function cloudmailin(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const body: EmailMessage = await request.json();
	const message_id: string | undefined | string[] = body.headers.message_id;
	if(typeof message_id != "string") {
		return new Response("", {
			status: 400,
			headers: STANDARD_HEADERS,
		});
	}
	await env.kv.put(message_id, JSON.stringify(body));
	return new Response("", {
		status: 200,
		headers: STANDARD_HEADERS,
	});
}

async function incoming(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const basicAuth = basicAuthentication(request);
	if(basicAuth === "cloudmailin:" + env.CLOUDMAILIN_KEY) {
		return cloudmailin(request, env, ctx);
	}
	return new Response("", {
		status: 401,
		headers: STANDARD_HEADERS,
	});
}
async function outgoing(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const outgoingEmail: {"to":string,"toName":string,"subject":string,"body":string} = await request.json();
	const body = JSON.stringify({
		"personalizations": [{
			"to": [ {
				"email": outgoingEmail.to,
				"name": outgoingEmail.toName
			}],
			"dkim_domain": "iggyvolz.com",
			"dkim_selector": "email",
			"dkim_private_key": env.DKIM_PRIVATE_KEY
		}],
		"from": {
			"email": "testcf@iggyvolz.com",
			"name": "Test cloudflare box",
		},

		"subject": outgoingEmail.subject,
		"content": [{
			"type": "text/plain",
			"value": outgoingEmail.body,
		}],
	});
	console.log(body)
	let send_request = new Request("https://api.mailchannels.net/tx/v1/send", {
		"method": "POST",
		"headers": {
			"content-type": "application/json",
		},
		body,
	});
	const res = await fetch(send_request);
	console.log({status: res.status, text: await res.text()})
	return new Response("", {
		headers: STANDARD_HEADERS
	});
}

async function onemail(request: Request, env: Env, ctx: ExecutionContext, matches: RegExpExecArray): Promise<Response> {
	let email: string;
	try {
		email = atob(matches[1]);
	} catch (e: unknown) {
		if(e instanceof DOMException) {
			return new Response("", {
				status: 404,
				headers: STANDARD_HEADERS,
			});
		}
		throw e;
	}
	const conts = await env.kv.get(email);
	if(typeof conts !== "string") {
		return new Response("", {
			status: 404,
			headers: STANDARD_HEADERS,
		});
	}
	return new Response(conts, {
		headers: {
			"Content-Type": "application/json",
			...STANDARD_HEADERS
		}
	})
}

async function listmail(request: Request, env: Env, ctx: ExecutionContext, matches: RegExpExecArray): Promise<Response> {
	let keys: string[] = [];
	let cursor: string | null | undefined = undefined;
	let mails: KVNamespaceListResult<unknown>;
	do {
		mails = await env.kv.list({cursor});
		keys.push(...mails.keys.map(({name}) => btoa(name)));
		cursor = mails.cursor;
	} while(!mails.list_complete);
	return new Response(JSON.stringify(keys), {
		headers: {
			"Content-Type": "application/json",
			...STANDARD_HEADERS,
		}
	})

}

function cloudmailinValidation(env: Env, token: null|string): boolean
{
	return token === "cloudmailin:" + env.CLOUDMAILIN_KEY
}

async function cfValidation(env: Env, token: null|string): Promise<boolean>
{
	if(typeof token !== "string") return false;
	return jwt(token, env.CLOUDFLARE_ORGANIZATION);
}

const STANDARD_HEADERS = {
	"access-control-allow-headers": "Cache-Control,Content-Type,Authorization",
	"access-control-allow-methods": "GET,HEAD,PUT,POST,DELETE",
	"access-control-allow-origin": "*",
};

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		if(request.method === "OPTIONS") {
			return new Response("", {
				headers: STANDARD_HEADERS
			})
		}
		try {
			const {pathname} = new URL(request.url);

			const routes: { route: RegExp, validation: (env: Env, token: null|string) => (Promise<boolean>|boolean), action: (request: Request, env: Env, ctx: ExecutionContext, matches: RegExpExecArray) => Promise<Response> }[] = [
				{route: /^\/incoming$/, validation: cloudmailinValidation, action: incoming},
				{route: /^\/outgoing$/, validation: cfValidation,action: outgoing},
				{route: /^\/mail\/([A-Za-z0-9=]+)$/, validation: cfValidation,action: onemail},
				{route: /^\/mail$/, validation: cfValidation, action: listmail},
			];
			for (const route of routes) {
				const matches = route.route.exec(pathname);
				if (matches !== null) {
					if(!await route.validation(env, basicAuthentication(request))) {
						return new Response("", {
							status: 401,
							headers: STANDARD_HEADERS,
						});
					}
					return await route.action(request, env, ctx, matches);
				}
			}
			return new Response("", {
				status: 404,
				headers: STANDARD_HEADERS,
			});
		} catch(e) {
			console.log({e});
			throw e;
		}
	},
};

function basicAuthentication(request: Request): string | null {

	try {
		const Authorization = request.headers.get('Authorization') ?? "";

		const [scheme, data] = Authorization.split(' ');

		if (!data) {
			return null;
		}

		if(scheme === "Basic") {
			return atob(data);
		} else {
			return data;
		}
	} catch(e) {
		return null;
	}
}
