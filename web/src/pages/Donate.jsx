import { useState, useRef } from 'react';

export default function Donate() {
  const [copyFeedback, setCopyFeedback] = useState('');
  const donationGridRef = useRef(null);
  const customAmountRef = useRef(null);

  const showCopyFeedback = (message = 'Address copied to clipboard!') => {
    setCopyFeedback(message);
    setTimeout(() => {
      setCopyFeedback('');
    }, 2000);
  };

  const copyWallet = (address) => {
    navigator.clipboard.writeText(address).then(() => {
      showCopyFeedback();
    }).catch(() => {
      const textArea = document.createElement('textarea');
      textArea.value = address;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showCopyFeedback();
    });
  };

  const copyLink = () => {
    const url = window.location.origin;
    navigator.clipboard.writeText(url).then(() => {
      showCopyFeedback('Link copied to clipboard!');
    }).catch(() => {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showCopyFeedback('Link copied to clipboard!');
    });
  };

  const shareNative = () => {
    if (navigator.share) {
      navigator.share({
        title: 'YT-DL Studio',
        text: 'Check out YT-DL Studio - a free, ad-free video downloader!',
        url: window.location.origin
      });
    }
  };

  const donate = (amount) => {
    alert(`Redirecting to donate $${amount}...`);
  };

  const donateCustom = () => {
    const amount = customAmountRef.current?.value;
    if (!amount || amount < 2) {
      alert('Please enter an amount of at least $2');
      return;
    }
    donate(amount);
  };

  const scrollLeft = () => {
    if (donationGridRef.current) {
      donationGridRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (donationGridRef.current) {
      donationGridRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  return (
    <>
      <div className={`copy-feedback ${copyFeedback ? 'show' : ''}`}>
        {copyFeedback}
      </div>

      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header Section */}
        <section className="card p-8">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0">
              <svg className="h-12 w-12 text-[var(--primary-green)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
            </div>
            <div>
              <h1 className="text-4xl font-bold mb-4">Support YT-DL Studio</h1>
              <p className="text-lg text-secondary-light dark:text-secondary-dark mb-4">
                YT-DL Studio helps creators, educators, and archivists save content from across the web. It's built with love, not for profit, and your support helps keep it free and accessible for everyone. It's a different kind of service that is made with love, not for profit.
              </p>
              <p className="text-lg text-secondary-light dark:text-secondary-dark mb-4">
                We believe that the internet doesn't have to be scary, which is why YT-DL Studio will never have ads or other kinds of malicious content. It's a promise that we firmly stand by. Everything we do is built with privacy, accessibility, and ease of use in mind, making it available for everyone.
              </p>
              <p className="text-lg text-secondary-light dark:text-secondary-dark mb-4">
                If you've found this tool useful, please consider supporting our work through a donation or by sharing it with others who might benefit from it.
              </p>
            </div>
          </div>
        </section>

        {/* Donation Options */}
        <section className="card p-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <svg className="h-8 w-8 text-[var(--primary-green)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.467-.22-2.121-.659-1.172-.879-1.172-2.303 0-3.182C10.536 7.78 11.264 7.561 12 7.561s1.464.219 2.121.659" />
            </svg>
            Choose Your Support Level
          </h2>

          <div className="relative donation-scroll-container">
            <button className="scroll-btn left-0" onClick={scrollLeft}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            </button>
            
            <div ref={donationGridRef} className="donation-grid">
              <button className="donation-option p-4 rounded-lg flex flex-col items-center text-center flex-shrink-0" onClick={() => donate(5)}>
                <svg className="h-8 w-8 text-[var(--primary-green)] mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.974 5.974 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
                </svg>
                <div className="font-semibold">$5</div>
                <div className="text-sm text-secondary-light dark:text-secondary-dark">Cup of coffee</div>
              </button>

              <button className="donation-option p-4 rounded-lg flex flex-col items-center text-center flex-shrink-0" onClick={() => donate(10)}>
                <svg className="h-8 w-8 text-[var(--primary-green)] mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21.5c-3.04 0-5.952-.714-8.5-1.983l8.5-16.517 8.5 16.517A19.09 19.09 0 0 1 12 21.5Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.38 15.866a14.94 14.94 0 0 0 6.815 1.634 14.944 14.944 0 0 0 6.502-1.479" />
                  <circle cx="13" cy="11.01" r="0.5" />
                  <circle cx="11" cy="14" r="0.5" />
                </svg>
                <div className="font-semibold">$10</div>
                <div className="text-sm text-secondary-light dark:text-secondary-dark">Full size pizza</div>
              </button>

              <button className="donation-option p-4 rounded-lg flex flex-col items-center text-center flex-shrink-0" onClick={() => donate(15)}>
                <svg className="h-8 w-8 text-[var(--primary-green)] mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 11h16a1 1 0 0 1 1 1v.5c0 1.5-2.517 5.573-4 6.5v1a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-1c-1.687-1.054-4-5-4-6.5V12a1 1 0 0 1 1-1Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4a2.4 2.4 0 0 0-1 2 2.4 2.4 0 0 0 1 2" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 4a2.4 2.4 0 0 0-1 2 2.4 2.4 0 0 0 1 2" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 4a2.4 2.4 0 0 0-1 2 2.4 2.4 0 0 0 1 2" />
                </svg>
                <div className="font-semibold">$15</div>
                <div className="text-sm text-secondary-light dark:text-secondary-dark">Full lunch</div>
              </button>

              <button className="donation-option p-4 rounded-lg flex flex-col items-center text-center flex-shrink-0" onClick={() => donate(30)}>
                <svg className="h-8 w-8 text-[var(--primary-green)] mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 3v12h-5c-.023-3.681.184-7.406 5-12Zm0 12v6h-1v-3m-10-14v17m-3-17v3a3 3 0 1 0 6 0V5" />
                </svg>
                <div className="font-semibold">$30</div>
                <div className="text-sm text-secondary-light dark:text-secondary-dark">Lunch for two</div>
              </button>

              <button className="donation-option p-4 rounded-lg flex flex-col items-center text-center flex-shrink-0" onClick={() => donate(50)}>
                <svg className="h-8 w-8 text-[var(--primary-green)] mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 3h8a2 2 0 0 1 2 2v1.82a5 5 0 0 0 .528 2.236l.944 1.888a5 5 0 0 1 .528 2.236V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5.82a5 5 0 0 1 .528-2.236l1.472-2.944V5a2 2 0 0 1 2-2Z" />
                  <circle cx="14" cy="15" r="2" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 21a2 2 0 0 0 2-2v-5.82a5 5 0 0 0-.528-2.236L6 8" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 7h2" />
                </svg>
                <div className="font-semibold">$50</div>
                <div className="text-sm text-secondary-light dark:text-secondary-dark">10kg of cat food</div>
              </button>
            </div>

            <button className="scroll-btn right-0" onClick={scrollRight}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
            </button>
            
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white mt-4">Custom Amount</h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <input type="number" ref={customAmountRef} placeholder="Enter custom amount (minimum $2)" 
                       className="w-full p-3 border border-[var(--border-color)] rounded-lg bg-[var(--card-bg)] text-[var(--text-color)]" 
                       min="2" step="0.01" />
              </div>
              <button onClick={donateCustom} className="btn btn-primary px-6 py-3">
                <svg className="h-5 w-5 mr-2 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
                Donate
              </button>
            </div>
          </div>
        </section>

        {/* Crypto Donations */}
        <section className="card p-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <svg className="h-8 w-8 text-[var(--primary-green)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 5h12l3 5-8.5 9.5a.7.7 0 0 1-1 0L3 10l3-5Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m10 12-2-2.2.6-1" />
            </svg>
            Alternative Ways to Donate
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button onClick={() => copyWallet('0xDA47A671B2411468E8320916C3e57D2F60FE7197')} className="crypto-wallet text-left">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-semibold">Ethereum</span>
              </div>
              <div className="text-sm text-secondary-light dark:text-secondary-dark break-all">
                0xDA47A671B2411468E8320916C3e57D2F60FE7197
              </div>
            </button>
            <button onClick={() => copyWallet('bc1qeqd27qknt3fwvuzpvv2ne730klggggwcqm43yq')} className="crypto-wallet text-left">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-semibold">Bitcoin</span>
              </div>
              <div className="text-sm text-secondary-light dark:text-secondary-dark break-all">
                bc1qeqd27qknt3fwvuzpvv2ne730klggggwcqm43yq
              </div>
            </button>
            <button onClick={() => copyWallet('463y93PsQDTYGVPAHUNcjiYDsxWjn7bL2FS9GYXjetEH5XEoNKB7kCHHQXsuoebbSv8RqGspo61pxhMQQrudDky2AfTGbs3')} className="crypto-wallet text-left">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-semibold">Monero</span>
              </div>
              <div className="text-sm text-secondary-light dark:text-secondary-dark break-all">
                463y93PsQDTYGVPAHUNcjiYDsxWjn7bL2FS9GYXjetEH5XEoNKB7kCHHQXsuoebbSv8RqGspo61pxhMQQrudDky2AfTGbs3
              </div>
            </button>
            <button onClick={() => copyWallet('BWPQpPvSyfauUm1BwmV55qE1vJT56Pc6qHrNFzCmtmFJ')} className="crypto-wallet text-left">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-semibold">Solana</span>
              </div>
              <div className="text-sm text-secondary-light dark:text-secondary-dark break-all">
                BWPQpPvSyfauUm1BwmV55qE1vJT56Pc6qHrNFzCmtmFJ
              </div>
            </button>
          </div>
        </section>

        {/* Share Section */}
        <section className="share-section">
          <div className="share-content-wrapper">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold mb-2">Share YT-DL Studio</h2>
              <p className="text-lg opacity-90 max-w-xs mx-auto">Help others discover this free, ad-free tool</p>
            </div>
            
            <div className="flex flex-wrap justify-center gap-4">
              <button onClick={copyLink} className="share-button">
                Copy Link
              </button>
              <a href="https://github.com/cyanidemilkshakee/yt-dls" target="_blank" rel="noreferrer" className="share-button">
                Star on GitHub
              </a>
              <a href="https://twitter.com/intent/tweet?text=Check%20out%20YT-DL%20Studio%20-%20a%20free,%20ad-free%20video%20downloader!&url=https://github.com/cyanidemilkshakee/yt-dls" target="_blank" rel="noreferrer" className="share-button">
                Tweet
              </a>
              {navigator.share && (
                <button onClick={shareNative} className="share-button">
                  Share
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
