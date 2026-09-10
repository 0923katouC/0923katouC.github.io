document.addEventListener('DOMContentLoaded',()=>{
  const gate=document.getElementById('essay-gate');
  const content=document.getElementById('essay-content');
  const form=document.getElementById('invite-form');
  const input=document.getElementById('invite-code');
  const status=document.getElementById('invite-status');
  if(!gate||!content||!form||!input||!status)return;

  const EXPECTED='6c8b7c96491654021accb7c2e7a773323dcb2b5a86e82cb1bdc98e6d6e6e92b7';
  const UNLOCK_KEY='cmc-essays-unlocked';
  const FAIL_KEY='cmc-essays-fails';
  const BLOCK_KEY='cmc-essays-block-until';
  const MAX_FAILS=5;
  const BLOCK_MS=30000;

  const reveal=()=>{
    sessionStorage.setItem(UNLOCK_KEY,'1');
    gate.hidden=true;
    content.hidden=false;
  };

  const digest=async value=>{
    const data=new TextEncoder().encode(value);
    const hash=await crypto.subtle.digest('SHA-256',data);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  };

  const setStatus=(zh,en)=>{
    const lang=document.documentElement.lang.startsWith('zh')?'zh':'en';
    status.textContent=lang==='zh'?zh:en;
  };

  const blocked=()=>{
    const until=Number(sessionStorage.getItem(BLOCK_KEY)||0);
    if(Date.now()<until){
      const seconds=Math.ceil((until-Date.now())/1000);
      setStatus(`尝试次数过多，请 ${seconds} 秒后再试。`,`Too many attempts. Try again in ${seconds} seconds.`);
      return true;
    }
    if(until)sessionStorage.removeItem(BLOCK_KEY);
    return false;
  };

  if(sessionStorage.getItem(UNLOCK_KEY)==='1'){
    reveal();
    return;
  }

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(blocked())return;
    const value=input.value.trim();
    if(!/^\d{6}$/.test(value)){
      setStatus('请输入 6 位邀请码。','Enter a 6-digit invitation code.');
      return;
    }
    const hashed=await digest(value);
    if(hashed===EXPECTED){
      sessionStorage.removeItem(FAIL_KEY);
      sessionStorage.removeItem(BLOCK_KEY);
      reveal();
      return;
    }
    const fails=Number(sessionStorage.getItem(FAIL_KEY)||0)+1;
    sessionStorage.setItem(FAIL_KEY,String(fails));
    input.value='';
    input.focus();
    if(fails>=MAX_FAILS){
      sessionStorage.setItem(FAIL_KEY,'0');
      sessionStorage.setItem(BLOCK_KEY,String(Date.now()+BLOCK_MS));
      setStatus('尝试次数过多，请 30 秒后再试。','Too many attempts. Try again in 30 seconds.');
    }else{
      setStatus(`邀请码错误，还可尝试 ${MAX_FAILS-fails} 次。`,`Incorrect code. ${MAX_FAILS-fails} attempts remaining.`);
    }
  });
});
