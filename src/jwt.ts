import * as jose from 'jose'
export default async function(jwt: string, organization: string): Promise<boolean>
{
    try {
        let r = jose.createRemoteJWKSet(new URL(`https://${organization}.cloudflareaccess.com/cdn-cgi/access/certs`));
        await jose.jwtVerify(jwt, r);
        return true;
    } catch(e) {
        return false;
    }
}