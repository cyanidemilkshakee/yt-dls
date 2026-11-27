import { useState } from 'react';
import ContentRegion from '../components/ContentRegion';
const PROJECT_URL = 'https://github.com/cyanidemilkshakee/yt-dls';
const wallets = [
  { network: 'Ethereum', address: '0xDA47A671B2411468E8320916C3e57D2F60FE7197' },
  { network: 'Bitcoin', address: 'bc1qeqd27qknt3fwvuzpvv2ne730klggggwcqm43yq' },
  { network: 'Monero', address: '463y93PsQDTYGVPAHUNcjiYDsxWjn7bL2FS9GYXjetEH5XEoNKB7kCHHQXsuoebbSv8RqGspo61pxhMQQrudDky2AfTGbs3' },
  { network: 'Solana', address: 'BWPQpPvSyfauUm1BwmV55qE1vJT56Pc6qHrNFzCmtmFJ' },

];
export default function Donate() {
  const [feedback, setFeedback] = useState('');
  const copy = async (value) => { try { await navigator.clipboard.writeText(value); setFeedback('Copied to clipboard.'); } catch { setFeedback('Could not access the clipboard. Select and copy the address below.'); } };
  return <div className="max-w-4xl mx-auto space-y-6"><ContentRegion className="p-6"><h1 className="text-3xl font-bold mb-4">Support YT-DL Studio</h1><p>If this project is useful to you, share it, report a reproducible issue, or contribute a fix.</p><a className="btn btn-primary mt-4" href={PROJECT_URL} target="_blank" rel="noreferrer">View the project</a><button className="btn ml-3" onClick={() => copy(PROJECT_URL)}>Copy project link</button></ContentRegion><ContentRegion className="p-6"><h2 className="text-xl font-semibold mb-4">Project donation addresses</h2><p className="mb-4">Use the matching network in your wallet. This app does not process payments.</p><div className="space-y-4">{wallets.map(wallet => <div key={wallet.network}><h3 className="font-semibold">{wallet.network}</h3><code className="block break-all my-2 text-sm">{wallet.address}</code><button className="btn" onClick={() => copy(wallet.address)}>Copy {wallet.network} address</button></div>)}</div></ContentRegion>{feedback && <p role="status">{feedback}</p>}</div>;
}
