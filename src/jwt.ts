import * as jose from 'jose'

export default async function(jwt: string, organization: string): Promise<string>
{
    const result = await jose.jwtVerify(jwt, jose.createRemoteJWKSet(new URL(`https://${organization}.cloudflareaccess.com/cdn-cgi/access/certs`)));
    if(typeof result.payload?.email === "string") {
        return result.payload.email;
    } else {
        throw new Error("No email in payload")
    }
}