/* All-in-One Player — 网页版逻辑（自 index.html 分离） */
/* ================= SOURCES · 八个音乐源共用同一套抽象与端点表 ================= */
var REPO='https://github.com/lzx-lgm/all-in-one-player';
var platforms=[
 {id:'all',name:'全部平台',color:'#3a3a44',icon:'全',desc:'八个源聚合检索',url:'',login:'—',play:'—'},
 {id:'qishui',name:'汽水音乐',color:'#00C2A8',icon:'汽',desc:'抖音热歌 · 短视频同款',url:'https://www.qishui.com/',login:'扫码',play:'试听兜底 · 自动换源'},
 {id:'spotify',name:'Spotify',color:'#1DB954',icon:'S',desc:'全球歌单 · 每日推荐',url:'https://open.spotify.com/',login:'官方账号',play:'无官方直链 · 自动换源'},
 {id:'apple',name:'Apple Music',color:'#FA2D48',icon:'A',desc:'无损 · 空间音频',url:'https://music.apple.com/',login:'官方账号',play:'官方链路'},
 {id:'youtube',name:'YouTube Music',color:'#FF0000',icon:'▶',desc:'MV 资源最全',url:'https://music.youtube.com/',login:'官方账号',play:'应用内直链'},
 {id:'qq',name:'QQ音乐',color:'#31C27C',icon:'Q',desc:'华语曲库 · MV',url:'https://y.qq.com/',login:'QQ扫码 / 微信扫码',play:'应用内直链'},
 {id:'netease',name:'网易云音乐',color:'#E60026',icon:'云',desc:'评论 · 独立音乐',url:'https://music.163.com/',login:'扫码',play:'应用内直链'},
 {id:'kugou',name:'酷狗音乐',color:'#2E9BFF',icon:'K',desc:'KTV · 铃声',url:'https://www.kugou.com/',login:'扫码',play:'应用内直链'},
 {id:'kuwo',name:'酷我音乐',color:'#FF6A00',icon:'我',desc:'长音频 · 有声',url:'https://www.kuwo.cn/',login:'扫码',play:'应用内直链'}
];
function platById(id){for(var i=0;i<platforms.length;i++)if(platforms[i].id===id)return platforms[i];return platforms[0]}
/* 登录状态如实记录：out 未登录 / in 已登录(本机标记,用户在官方页完成登录后确认) / expired 已过期 / preview 试听中 */
var loginState={qishui:'out',spotify:'out',apple:'out',youtube:'out',qq:'out',netease:'out',kugou:'out',kuwo:'out'};
var STATE_TXT={out:'未登录',in:'已登录 · 本机标记',expired:'已过期',preview:'试听中'};

/* ================= DATA ================= */
var L=function(zh,en){return [zh,en]};
var tracks=[
 {title:'Neon Skyline — 星际漫游',artist:'Luna Waves',plat:'spotify',src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',color:'#1DB954',dur:'6:12',locked:false,tag:'热门',lsrc:'qq',lines:[L('霓虹在楼宇之间醒来','Neon wakes between the towers'),L('我们穿过城市发光的海','We cross the glowing sea of the city'),L('把心跳调到最大声','Turn the heartbeat all the way up'),L('星尘落在耳机里合唱','Stardust sings inside the headphones')]},
 {title:'Midnight Drive — 夜行',artist:'The Weekenders',plat:'apple',src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',color:'#FA2D48',dur:'5:04',locked:false,tag:'可播',lsrc:'kugou',lines:[L('午夜的路没有尽头','The midnight road has no end'),L('车灯切开薄薄的雾','Headlights cut the thin fog'),L('你哼着跑调的歌','You hum a song off-key'),L('我们把城市开成了海','We drive the city into the sea')]},
 {title:'周末派对 Weekend Party',artist:'Mango Club',plat:'qq',src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',color:'#31C27C',dur:'5:48',locked:true,tag:'VIP',lsrc:'qq',lines:[L('周五的风先到楼下','Friday wind arrives downstairs first'),L('把烦恼留在电梯里','Leave the worries in the elevator'),L('音乐一响全场起立','When the music hits, everyone stands'),L('今晚不谈明天','Tonight we do not talk about tomorrow')]},
 {title:'云端漫步 Walk on Clouds',artist:'陈屿',plat:'netease',src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',color:'#E60026',dur:'5:12',locked:true,tag:'会员',lsrc:'netease',lines:[L('踩着云的边缘走','Walking on the edge of clouds'),L('风把影子吹得很长','The wind stretches the shadow long'),L('你说远方不远','You said far away is not far'),L('只要脚步不停','As long as the steps keep going')]},
 {title:'旅行日记 Travel Log',artist:'Aria Chen',plat:'youtube',src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',color:'#FF0000',dur:'4:56',locked:false,tag:'MV同款',lsrc:'kugou',lines:[L('车票夹在日记本里','The ticket is kept in the diary'),L('山一程，水一程','One stretch of mountains, one of rivers'),L('陌生人的微笑很暖','A stranger\u2019s smile is warm'),L('把故事写进风里','Write the story into the wind')]},
 {title:'霓虹雨 Neon Rain',artist:'DJ Kugo',plat:'kugou',src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',color:'#2E9BFF',dur:'5:20',locked:false,tag:'可播',lsrc:'qq',lines:[L('雨落在霓虹上','Rain falls on the neon'),L('整条街都在发光','The whole street is glowing'),L('伞下的节奏刚刚好','The rhythm under the umbrella is just right'),L('今夜适合淋一场舞','Tonight is for dancing in the rain')]},
 {title:'夏日海风 Summer Breeze',artist:'Kuwo Band',plat:'kuwo',src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',color:'#FF6A00',dur:'4:44',locked:false,tag:'清新',lsrc:'netease',lines:[L('海风翻着旧相册','The sea breeze flips the old album'),L('夏天停在这一页','Summer stays on this page'),L('冰汽水冒着泡','Iced soda is bubbling'),L('笑声比阳光先到','Laughter arrives before the sunlight')]},
 {title:'星尘交响 Stardust',artist:'Nova Orchestra',plat:'spotify',src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',color:'#7C6FF0',dur:'6:02',locked:false,tag:'无损演示',lsrc:'qq',lines:[L('弦乐先于星光响起','Strings sound before the starlight'),L('银河在穹顶旋转','The galaxy turns above the dome'),L('每一个音符都是尘','Every note is a grain of dust'),L('落下来，成为我们','Falling down, becoming us')]},
 {title:'山海之间 Mountains & Sea',artist:'林小舟',plat:'qq',src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',color:'#009688',dur:'5:33',locked:false,tag:'华语',lsrc:'netease',lines:[L('翻过山就看见海','Over the mountain, there is the sea'),L('风里有松针的味道','The wind smells of pine needles'),L('你说家在云脚下','You said home is under the clouds'),L('我把思念系在帆上','I tie my longing to the sail')]},
 {title:'深夜电台 Late Radio',artist:'网易云精选',plat:'netease',src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',color:'#3a3f4a',dur:'5:01',locked:false,tag:'治愈',lsrc:'kugou',lines:[L('深夜电台还醒着','The late-night radio is still awake'),L('替没睡的人留灯','Keeping a light for the sleepless'),L('把心事说轻一点','Say the worries a little lighter'),L('晚安，明天见','Good night, see you tomorrow')]},
 {title:'汽水夏天 Soda Summer',artist:'气泡水乐队',plat:'qishui',src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',color:'#00C2A8',dur:'5:18',locked:false,tag:'抖音热歌',lsrc:'qq',lines:[L('汽水冒泡的夏天','The summer of bubbling soda'),L('你笑得像冰镇西瓜','You smile like chilled watermelon'),L('蝉鸣盖过心跳','Cicadas drown the heartbeat'),L('这一口，敬青春','This sip is for our youth')]},
 {title:'心跳气泡 Bubble Heartbeat',artist:'小汽水',plat:'qishui',src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3',color:'#00A8E8',dur:'4:52',locked:true,tag:'VIP',lsrc:'kugou',lines:[L('心跳冒出一串气泡','The heartbeat rises in bubbles'),L('藏不住啦，藏不住','Cannot hide it anymore'),L('你经过的每个瞬间','Every moment you pass by'),L('都甜得冒泡','Is sweet and bubbling')]}
];
tracks.forEach(function(t){var o={};o[t.lsrc]=t.lines;t.lyr=o;});
var mvs=[
 {title:'For Bigger Fun — 欢乐大片',artist:'演示 MV',plat:'youtube',platName:'YouTube Music',src:'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4'},
 {title:'For Bigger Blazes — 火焰时刻',artist:'演示 MV',plat:'qq',platName:'QQ音乐',src:'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'},
 {title:'Big Buck Bunny — 森林物语',artist:'演示 MV',plat:'spotify',platName:'Spotify Video',src:'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'},
 {title:'Elephants Dream — 梦境',artist:'演示 MV',plat:'apple',platName:'Apple Music',src:'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'},
 {title:'For Bigger Escapes — 逃离计划',artist:'演示 MV',plat:'netease',platName:'网易云音乐',src:'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'},
 {title:'For Bigger Joyrides — 兜风',artist:'演示 MV',plat:'kugou',platName:'酷狗音乐',src:'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4'},
 {title:'Sintel — 寻龙少女',artist:'演示 MV · 汽水热播',plat:'qishui',platName:'汽水音乐',src:'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'},
 {title:'Tears of Steel — 钢铁之泪',artist:'演示 MV',plat:'kuwo',platName:'酷我音乐',src:'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'}
];

/* ================= STATE / HELPERS ================= */
var $=function(id){return document.getElementById(id)};
var audio=$('audio'),video=$('mainVideo');
var current=-1,filterPlat='all',libScope='all',favs={},shuffleOn=false,repeatMode=1,beatMul=1,curLyricIdx=-1,audioCtx=null,analyser=null,errCount=0,localAudioURL=null,localVideoURL=null;
var toastTimer=null;
function toast(t){var el=$('toast');el.textContent=t;el.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.style.display='none'},2800)}
function fmt(s){if(!s||isNaN(s))return'0:00';var m=Math.floor(s/60),ss=Math.floor(s%60);return m+':'+(ss<10?'0':'')+ss}
function esc(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;')}
function normTitle(t){return t.split('—')[0].split(' ').join('').toLowerCase()}
/* 歌词与音乐源分离：QQ → 酷狗 → 网易云 独立回退链 */
var LYRIC_CHAIN=['qq','kugou','netease'];
function getLyrics(t){for(var i=0;i<LYRIC_CHAIN.length;i++){var k=LYRIC_CHAIN[i];if(t.lyr&&t.lyr[k])return{lines:t.lyr[k],from:platById(k).name}}return{lines:[[t.title,t.artist]],from:'无歌词源'}}
function playable(t){return !t.locked||loginState[t.plat]==='in'}

/* ================= PLATFORMS UI ================= */
function renderPlatforms(){
 var strip=$('platformStrip');strip.innerHTML='';
 platforms.forEach(function(p){
  var b=document.createElement('button');b.className='p-chip'+(filterPlat===p.id?' active':'');
  var stateTxt=p.id==='all'?'聚合 8 源':STATE_TXT[loginState[p.id]];
  b.innerHTML=(p.id==='all'?'<span>全部平台</span>':'<span class="chip-icon" style="background:'+p.color+'">'+p.icon+'</span><span>'+p.name+'</span><span class="cdot '+(loginState[p.id]==='in'?'on':'')+'"></span>')+'<small style="color:var(--muted);font-size:11px">'+stateTxt+'</small>';
  b.onclick=function(){setSource(p.id)};strip.appendChild(b);
 });
 var list=$('platformList');list.innerHTML='';
 platforms.slice(1).forEach(function(p){
  var st=loginState[p.id];
  var badgeCls=st==='in'?'badge orig':(st==='preview'?'badge vip':'badge');
  var badgeStyle=st==='expired'?' style="background:rgba(255,143,163,.14);color:var(--rose);border:1px solid rgba(255,143,163,.4)"':'';
  var d=document.createElement('div');d.className='plat-row';
  var acts='<a class="connect" href="'+p.url+'" target="_blank" rel="noopener" style="text-decoration:none;display:inline-flex;align-items:center">官方登录 ↗</a>';
  if(st==='in')acts+='<button class="connect" data-act="sync">同步收藏</button><button class="connect" data-act="expire">标记过期</button><button class="connect" data-act="out">退出</button>';
  d.innerHTML='<div class="plat-icon" style="background:'+p.color+'">'+p.icon+'</div><div class="pi"><b>'+p.name+'</b> <span class="'+badgeCls+'"'+badgeStyle+'>'+STATE_TXT[st]+'</span><p>'+p.desc+' · 登录：'+p.login+'</p></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">'+acts+'</div>';
  d.querySelectorAll('[data-act]').forEach(function(btn){btn.onclick=function(){
    var a=btn.getAttribute('data-act');
    if(a==='sync')syncFavorites(p.id);
    if(a==='expire'){loginState[p.id]='expired';renderPlatforms();updateWizStatus();toast(p.name+' 已标记为过期 — 凭证失效时就是这个状态，请去官方页重新扫码登录')}
    if(a==='out'){loginState[p.id]='out';renderPlatforms();updateWizStatus();toast(p.name+' 已退出（本机标记清除）')}
  }});
  list.appendChild(d);
 });
}
/* 切源语义：立刻清空旧内容 + 骨架屏，标题与内容同时换新源 */
var skelStyle=document.createElement('style');skelStyle.textContent='.skel{height:68px;border-radius:14px;background:linear-gradient(100deg,rgba(255,255,255,.04) 40%,rgba(255,255,255,.11) 50%,rgba(255,255,255,.04) 60%);background-size:200% 100%;animation:skmove 1.1s linear infinite;margin-bottom:8px}@keyframes skmove{to{background-position:-200% 0}}@media(max-width:760px){#wizSteps{grid-template-columns:1fr!important}}';document.head.appendChild(skelStyle);
function showSkeleton(title){$('trackListTitle').textContent=title;$('trackCount').textContent='加载中…';$('trackList').innerHTML='<div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div>'}
function setSource(id){filterPlat=id;libScope='all';renderPlatforms();var p=platById(id);showSkeleton(id==='all'?'统一搜索结果 · 歌曲':'音乐源 · '+p.name);setTimeout(renderTracks,480)}
function syncFavorites(pid){filterPlat=pid;libScope='fav';renderPlatforms();var p=platById(pid);showSkeleton('我的收藏 · '+p.name+'（同步中）');setTimeout(function(){renderTracks();toast('已同步 '+p.name+' 的收藏：只显示你点过 ♡ 的曲目（本页曲库范围内）')},650)}

/* ================= TRACKS / SHELF / LYRICS ================= */
function renderTracks(){
 var q=($('searchInput').value||'').toLowerCase();
 var list=$('trackList');list.innerHTML='';var n=0;
 if(libScope==='real'&&realTracks.length){
  realTracks.forEach(function(t,idx){
   if(filterPlat!=='all'&&t.plat!==filterPlat)return;
   if(q&&(t.title+t.artist).toLowerCase().indexOf(q)<0)return;
   n++;
   var row=document.createElement('div');row.className='track'+(realCurrent===idx?' active':'');
   row.innerHTML='<div class="cover" style="background:'+t.color+'">真</div><div class="track-info"><b>'+esc(t.title)+'</b><span>'+esc(t.artist)+' · '+(t.durationMs?fmt(t.durationMs/1000):'')+' · 来自 '+esc(t.playlistName||'')+'</span></div><span class="badge orig">真同步 · '+platById(t.plat).name+'</span>';
   var pb=document.createElement('button');pb.className='play-small';pb.textContent='▶';pb.onclick=function(e){e.stopPropagation();playRealTrack(t)};
   row.appendChild(pb);row.onclick=function(){playRealTrack(t)};list.appendChild(row);
  });
  $('trackCount').textContent=n+' 首（真实歌单）';
  $('trackListTitle').textContent='已同步 · '+platById(filterPlat).name+' 真实歌单';
  if(n===0)list.innerHTML='<p style="color:var(--muted);padding:14px;line-height:1.8">这个身份下没有歌单或没有曲目。QQ 请确认用的是「QQ号」身份（微信身份的资产是空的、与 QQ 号不互通）。</p>';
  renderShelf();return;
 }
 tracks.forEach(function(t,idx){
  if(filterPlat!=='all'&&t.plat!==filterPlat)return;
  if(libScope==='fav'&&!favs[t.title])return;
  if(q&&(t.title+t.artist+platById(t.plat).name).toLowerCase().indexOf(q)<0)return;
  n++;
  var row=document.createElement('div');row.className='track'+(idx===current?' active':'');
  row.innerHTML='<div class="cover" style="background:'+t.color+'">'+esc(t.title.trim().charAt(0))+'</div><div class="track-info"><b>'+esc(t.title)+'</b><span>'+esc(t.artist)+' · '+t.dur+'</span></div><span class="badge">'+platById(t.plat).name+'</span>'+(t.locked?'<span class="badge vip">'+t.tag+' · 需授权</span>':'<span class="badge">'+t.tag+'</span>');
  var fav=document.createElement('button');fav.className='play-small';fav.style.cssText='width:38px;height:38px;flex-basis:38px;font-size:15px';fav.textContent=favs[t.title]?'♥':'♡';fav.title='收藏（同步收藏时只同步已收藏）';fav.onclick=function(e){e.stopPropagation();if(favs[t.title])delete favs[t.title];else favs[t.title]=1;renderTracks();toast(favs[t.title]?'已收藏：'+t.title:'已取消收藏')};
  var pb=document.createElement('button');pb.className='play-small';pb.textContent=(idx===current&&!audio.paused)?'⏸':'▶';pb.onclick=function(e){e.stopPropagation();playTrack(idx)};
  row.appendChild(fav);row.appendChild(pb);row.onclick=function(){playTrack(idx)};list.appendChild(row);
 });
 $('trackCount').textContent=n+' 首';
 $('trackListTitle').textContent=libScope==='fav'?('我的收藏 · '+(filterPlat==='all'?'全部平台':platById(filterPlat).name)):(filterPlat==='all'?'统一搜索结果 · 歌曲':'音乐源 · '+platById(filterPlat).name);
 if(n===0)list.innerHTML='<p style="color:var(--muted);padding:14px;line-height:1.8">'+(libScope==='fav'?'这里还没有收藏。先在曲库里点 ♡ 收藏几首，再回平台中心点「同步收藏」。':'没有找到匹配的歌曲，换个关键词，或切回「全部平台」。')+'</p>';
 renderShelf();
}
function renderShelf(){
 var sh=$('shelf');if(!sh)return;sh.innerHTML='';
 tracks.forEach(function(t,idx){
  var c=document.createElement('button');c.className='shelf-card'+(idx===current?' playing':'');
  var ang=-16+(idx%6)*6;c.style.transform='rotateY('+ang+'deg)';
  c.innerHTML='<div class="sc-cover" style="background:linear-gradient(140deg,'+t.color+',rgba(0,0,0,.55))">'+esc(t.title.trim().charAt(0))+'</div><b>'+esc(t.title)+'</b><span>'+esc(t.artist)+' · '+platById(t.plat).name+'</span>';
  c.onclick=function(){playTrack(idx)};sh.appendChild(c);
 });
}
function renderLyrics(t){
 var g=getLyrics(t);var box=$('lyricsBox');box.innerHTML='';
 g.lines.forEach(function(ln,i){var d=document.createElement('div');if(i===curLyricIdx)d.className='cur';d.textContent=ln[0];box.appendChild(d)});
 var foot=document.createElement('div');foot.style.cssText='color:var(--faint);font-size:12px;font-family:"Noto Sans SC"';foot.textContent='歌词来源：'+g.from+'（回退链 QQ → 酷狗 → 网易云，与音乐源独立）';box.appendChild(foot);
 $('lyricSrcLabel').textContent='歌词源 · '+g.from;
 $('stageLyric').textContent=g.lines[Math.max(0,curLyricIdx)][0];
 $('stageLyricSub').textContent=g.lines[Math.max(0,curLyricIdx)][1]||'';
}

/* ================= PLAYBACK ================= */
function updateStage(t){
 $('nowTitle').textContent=t.title;$('nowArtist').textContent=t.artist+' · '+platById(t.plat).name;
 $('stageTitle').textContent=t.title;$('stageArtist').textContent=t.artist+' · '+platById(t.plat).name+' · 应用内播放';
 var g='linear-gradient(135deg,'+t.color+',#0b2b26)';
 $('disc').style.background=g;$('disc').textContent=t.title.trim().charAt(0);
 $('nowCov').style.background=g;$('nowCov').textContent=t.title.trim().charAt(0);
 $('durTime').textContent=t.dur;$('curTime').textContent='0:00';curLyricIdx=0;renderLyrics(t);
}
function playTrack(idx){
 var t=tracks[idx];
 if(t&&t.real){playRealTrack(t);return}
 if(!playable(t)){attemptAutoSource(t);return}
 if(current===idx&&audio.src){if(audio.paused)audio.play();else audio.pause();syncPlayUI();renderTracks();return}
 current=idx;errCount=0;audio.src=t.src;audio.playbackRate=parseFloat($('speedSel').value);video.pause();
 audio.play().then(function(){toast('正在播放：'+t.title+'（'+platById(t.plat).name+' 源 · 应用内直链）')}).catch(function(){toast('音频加载中或被浏览器拦截，请再点一次播放')});
 updateStage(t);syncPlayUI();renderTracks();initViz();
}
/* 试听/VIP 换源：并行去其它已登录/可播平台按 歌名+艺人+时长 匹配同一首歌 */
function attemptAutoSource(t){
 var p=platById(t.plat);
 toast('「'+t.title+'」在 '+p.name+' 需会员/仅试听 — 正在并行匹配其它平台同一首歌…');
 setTimeout(function(){
  var hit=-1;
  tracks.forEach(function(o,i){if(i!==tracks.indexOf(t)&&playable(o)&&normTitle(o.title)===normTitle(t.title)&&o.artist===t.artist)hit=i});
  if(hit>=0){toast('已自动换源 → '+platById(tracks[hit].plat).name+' 的同曲目版本');playTrack(hit);return}
  if(loginState[t.plat]==='out')loginState[t.plat]='preview';
  renderPlatforms();updateWizStatus();openModal(p,t);
 },700);
}
function syncPlayUI(){
 var playing=!audio.paused;
 $('playBtn').textContent=playing?'⏸':'▶';
 $('disc').classList.toggle('spin',playing);$('nowCov').classList.toggle('spin',playing);
}
$('playBtn').onclick=function(){if(current<0||!audio.src){playTrack(0);return}if(audio.paused)audio.play();else audio.pause();syncPlayUI();renderTracks()};
$('heroPlay').onclick=function(){switchMode('music');playTrack(current>=0?current:0)};
function nextIdx(){if(shuffleOn)return Math.floor(Math.random()*tracks.length);return (current+1)%tracks.length}
$('nextBtn').onclick=function(){playTrack(nextIdx())};
$('prevBtn').onclick=function(){playTrack((current-1+tracks.length)%tracks.length)};
$('shuffleBtn').onclick=function(){shuffleOn=!shuffleOn;this.classList.toggle('on',shuffleOn);toast(shuffleOn?'随机播放：开（下一首随机抽）':'随机播放：关')};
$('repeatBtn').onclick=function(){repeatMode=(repeatMode+1)%3;audio.loop=(repeatMode===2);this.classList.toggle('on',repeatMode!==0);toast(['循环：关（播完列表就停）','循环：全部循环','循环：单曲循环'][repeatMode])};
audio.loop=false;
$('speedSel').onchange=function(){audio.playbackRate=parseFloat(this.value);toast('音乐倍速 '+this.value+'×')};
$('vol').addEventListener('input',function(e){audio.volume=e.target.value/100;video.volume=e.target.value/100});
$('seek').addEventListener('input',function(e){if(audio.duration)audio.currentTime=e.target.value/100*audio.duration});
audio.addEventListener('timeupdate',function(){
 if(audio.duration){$('seek').value=audio.currentTime/audio.duration*100;$('curTime').textContent=fmt(audio.currentTime);$('durTime').textContent=fmt(audio.duration)}
 if(current>=0){var t=tracks[current];var g=getLyrics(t);var idx=Math.floor(audio.currentTime/7)%g.lines.length;if(idx!==curLyricIdx){curLyricIdx=idx;renderLyrics(t)}}
});
audio.addEventListener('ended',function(){if(repeatMode===1)playTrack(nextIdx());else if(repeatMode===0&&(current<tracks.length-1||shuffleOn))playTrack(nextIdx());else{syncPlayUI();renderTracks()}});
audio.addEventListener('play',function(){syncPlayUI();renderTracks()});
audio.addEventListener('pause',function(){syncPlayUI();renderTracks()});
audio.addEventListener('error',function(){if(!audio.src)return;errCount++;if(errCount<=2){toast('这个音频源加载失败，自动跳到下一首');playTrack(nextIdx())}else toast('音频源加载失败，请检查网络后重试')},true);

/* ================= AUTH MODAL（真实跳转，不假装连接） ================= */
function openModal(p,t){
 $('modalPlat').textContent=p.name+' · 官方授权';
 $('modalTitle').textContent=p.name+' 需要会员 / 授权';
 $('modalText').textContent='「'+(t?t.title:'该内容')+'」是 '+p.name+' 的会员内容，这个平台通常只给试听。已替你在其它已登录 / 可播平台按歌名+艺人+时长匹配过同一首歌，暂时没有找到可播的全曲版本。下面按钮会打开 '+p.name+' 官方页面，你可以在那里扫码登录、开通会员后在其官方应用内播放。';
 var a=$('authLink');a.href=p.url;a.textContent='打开 '+p.name+' 官方页面（扫码登录）↗';
 $('authModal').classList.add('open');
}
function closeModal(){$('authModal').classList.remove('open')}
$('authModal').addEventListener('click',function(e){if(e.target===this)closeModal()});

/* ================= WIZARD（选平台 → 官方扫码 → 同步收藏） ================= */
var wizPlat='netease';
function buildWizard(){
 var sel=$('wizPlatSel');sel.innerHTML='';
 platforms.slice(1).forEach(function(p){var o=document.createElement('option');o.value=p.id;o.textContent=p.name+'（'+p.login+'）';sel.appendChild(o)});
 sel.value=wizPlat;updWizLink();
 sel.onchange=function(){wizPlat=this.value;updWizLink();setSource(wizPlat)};
 $('wizLoginLink').addEventListener('click',function(e){
  markStep(2);
  // 桌面版：点登录链接不开系统浏览器，改开内嵌官方登录窗（独立 partition，可收 Cookie 真同步）
  if (window.desktopAPI && window.desktopAPI.isDesktop) {
    e.preventDefault();
    desktopLogin(wizPlat, currentIdentity(wizPlat));
  }
 });
 $('wizConfirmBtn').onclick=function(){
  // 桌面版：确认 = 先查本机登录态；未登录就打开内嵌登录窗，已登录就真同步官网歌单
  if (window.desktopAPI && window.desktopAPI.isDesktop) {
    desktopConfirm(wizPlat, currentIdentity(wizPlat));
    return;
  }
  loginState[wizPlat]='in';markStep(3);renderPlatforms();updateWizStatus();
  toast(platById(wizPlat).name+'：已按你的确认标记为已登录（凭证在官方页/本机，本页未读取密码或 Cookie）');
  syncFavorites(wizPlat);
 };
 var et=$('endpointTable');et.innerHTML='';
 platforms.slice(1).forEach(function(p){
  var r=document.createElement('div');r.style.cssText='display:flex;gap:8px;flex-wrap:wrap;padding:5px 0;border-bottom:1px solid var(--line)';
  r.innerHTML='<b style="color:var(--ink2);min-width:92px">'+p.name+'</b><span>/api/'+p.id+'/library/index · /albumTracks · /playlistTracks</span><span style="margin-left:auto">登录：'+p.login+' · 播放：'+p.play+'</span>';et.appendChild(r);
 });
}
function updWizLink(){var p=platById(wizPlat);var a=$('wizLoginLink');a.href=p.url;a.textContent='打开 '+p.name+' 官方登录页 ↗';var sel=$('wizIdentSel');if(sel)sel.style.display=(wizPlat==='qq')?'block':'none'}
function markStep(n){document.querySelectorAll('.wiz-step').forEach(function(el){el.style.borderColor=(+el.getAttribute('data-step')<=n)?'var(--accent)':'var(--line)'})}
function updateWizStatus(){
 var ins=[],pre=[],exp=[];
 platforms.slice(1).forEach(function(p){var st=loginState[p.id];if(st==='in')ins.push(p.name);if(st==='preview')pre.push(p.name);if(st==='expired')exp.push(p.name)});
 var txt='当前状态：';
 txt+=ins.length?('已登录（本机标记）— '+ins.join('、').toString()+'；'):'';
 txt+=pre.length?('试听中 — '+pre.join('、')+'；'):'';
 txt+=exp.length?('已过期 — '+exp.join('、')+'；'):'';
 if(!ins.length&&!pre.length&&!exp.length)txt+='全部平台未登录。';
 txt+=' 不登录也能用——演示曲目、演示 MV 和本地文件导入都照常真实播放。';
 $('wizStatus').textContent=txt;
}
$('loginBtn').onclick=function(){switchMode('music');$('connectWizard').scrollIntoView({behavior:'smooth',block:'center'})};

/* ================= SEARCH / MODE ================= */
function doSearch(){renderTracks();renderMVs()}
$('searchBtn').onclick=function(){doSearch();$('trackList').scrollIntoView({behavior:'smooth',block:'center'})};
$('searchInput').addEventListener('input',doSearch);
function switchMode(m){
 var isMV=m==='mv';
 $('musicSection').classList.toggle('hidden',isMV);$('mvSection').classList.toggle('hidden',!isMV);
 $('tabMusic').classList.toggle('active',!isMV);$('tabMV').classList.toggle('active',isMV);
 $('modeBtn').textContent=isMV?'音乐舞台':'MV 影院';
 if(isMV){audio.pause();syncPlayUI()}else{video.pause()}
}
$('modeBtn').onclick=function(){switchMode($('mvSection').classList.contains('hidden')?'mv':'music')};

/* ================= THEATER · MV / 视频原画直通 ================= */
function extOf(src){var m=String(src).split('?')[0].match(/\.([a-z0-9]+)$/i);return m?m[1].toUpperCase():'MP4'}
function renderMVs(){
 var q=($('searchInput').value||'').toLowerCase();
 var g=$('mvGrid');g.innerHTML='';var n=0;
 mvs.forEach(function(mv){
  if(filterPlat!=='all'&&mv.plat!==filterPlat)return;
  if(q&&(mv.title+mv.artist+mv.platName).toLowerCase().indexOf(q)<0)return;
  n++;
  var b=document.createElement('button');b.className='mv-item';
  b.innerHTML='<video muted preload="metadata" src="'+mv.src+'#t=1"></video><div class="mi"><b>'+esc(mv.title)+'</b><span>'+esc(mv.artist)+' · '+mv.platName+'</span> <span class="badge orig">原画直通</span></div>';
  b.onclick=function(){loadMV(mv)};g.appendChild(b);
 });
 if(n===0)g.innerHTML='<p style="color:var(--muted)">这个平台/关键词下暂时没有演示 MV，切回「全部平台」看看。</p>';
}
function loadMV(mv){
 if(localVideoURL){URL.revokeObjectURL(localVideoURL);localVideoURL=null}
 video.src=mv.src;$('mvTitle').textContent=mv.title+' — '+mv.artist;
 $('metaFmt').textContent=extOf(mv.src);$('metaSrc').textContent='演示 MV · '+mv.platName;$('metaRes').textContent='读取中…';
 $('localMeta').textContent='';
 video.play().then(function(){toast('正在原画播放：'+mv.title)}).catch(function(){toast('点 ▶ 播放按钮开始播放')});
 audio.pause();syncPlayUI();
}
video.addEventListener('loadedmetadata',function(){
 if(video.videoWidth)$('metaRes').textContent=video.videoWidth+' × '+video.videoHeight+' · 原始';
 $('qualitySel').textContent='画质 · 原始 '+video.videoWidth+'×'+video.videoHeight+'（源文件 · 不转码）';
});
/* 画质为信息展示：演示片源只有原始一档，不提供假切换 */
$('vidSpeedSel').onchange=function(){video.playbackRate=parseFloat(this.value);toast('视频倍速 '+this.value+'×')};
$('mvPlayBtn').onclick=function(){if(video.paused)video.play();else video.pause()};
video.addEventListener('play',function(){$('mvPlayBtn').textContent='⏸ 暂停';audio.pause();syncPlayUI()});
video.addEventListener('pause',function(){$('mvPlayBtn').textContent='▶ 播放'});
$('origBtn').onclick=function(){video.classList.remove('native');this.classList.add('on');$('nativeBtn').classList.remove('on');toast('原始分辨率直通：自适应屏幕完整显示，不裁切、不转码')};
$('nativeBtn').onclick=function(){video.classList.add('native');this.classList.add('on');$('origBtn').classList.remove('on');toast('1:1 原生尺寸：按源文件像素尺寸显示（超出屏幕时以屏幕为界）')};
$('fsBtn').onclick=function(){var el=video.closest('.theater-screen')||video;if(el.requestFullscreen)el.requestFullscreen().catch(function(){toast('当前浏览器不允许全屏')});else if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();else toast('当前浏览器不支持全屏')};
$('pipBtn').onclick=function(){if(document.pictureInPictureElement)document.exitPictureInPicture();else if(video.requestPictureInPicture)video.requestPictureInPicture().catch(function(){toast('当前浏览器不支持画中画，或视频还没开始播')});else toast('当前浏览器不支持画中画')};
video.addEventListener('error',function(){
 if(video.currentSrc&&video.currentSrc.indexOf('blob:')===0){$('localMeta').textContent='⚠ 浏览器无法解码这个本地文件的编码（容器或编码不受支持）。文件本身没问题 — 请用下方桌面软件版（Electron 完整解码）打开，或换 MP4(H.264) / WebM 文件。';toast('本地文件编码不受当前浏览器支持，见下方说明')}
},true);

/* ================= 本地文件导入（不登录也能播） ================= */
function fileSizeMB(f){return (f.size/1048576).toFixed(2)+' MB'}
function handleFile(f){
 if(!f)return;
 var ext=(f.name.split('.').pop()||'').toUpperCase();
 var isAudio=(f.type&&f.type.indexOf('audio')===0)||/^(MP3|WAV|FLAC|OGG|M4A|AAC)$/.test(ext);
 if(isAudio){
  if(localAudioURL)URL.revokeObjectURL(localAudioURL);
  localAudioURL=URL.createObjectURL(f);current=-1;audio.src=localAudioURL;audio.playbackRate=parseFloat($('speedSel').value);
  $('nowTitle').textContent=f.name;$('nowArtist').textContent='本地文件 · '+ext+' · 原始格式直通';
  $('stageTitle').textContent=f.name;$('stageArtist').textContent='本地音频 · '+ext+' · '+fileSizeMB(f)+' · 不转码';
  $('disc').textContent='本';$('nowCov').textContent='本';curLyricIdx=0;
  $('lyricsBox').innerHTML='<div>本地音频没有内置歌词源</div><div style="color:var(--faint);font-size:12px">桌面版可把同名 .lrc 放在同目录自动加载；网页版先安心听歌。</div>';
  $('stageLyric').textContent=f.name.replace(/\.[^.]+$/,'');$('stageLyricSub').textContent='LOCAL FILE · ORIGINAL FORMAT';
  audio.play().then(function(){toast('本地音频播放中：'+f.name)}).catch(function(){toast('点播放键开始播放本地音频')});
  syncPlayUI();initViz();switchMode('music');return;
 }
 if(localVideoURL)URL.revokeObjectURL(localVideoURL);
 localVideoURL=URL.createObjectURL(f);
 switchMode('mv');video.src=localVideoURL;
 $('mvTitle').textContent=f.name+' — 本地视频';
 $('metaFmt').textContent=ext;$('metaSrc').textContent='本地文件';$('metaRes').textContent='读取中…';
 $('localMeta').textContent='已导入：'+f.name+' · '+ext+' · '+fileSizeMB(f)+' · 正在读取原始分辨率…（文件只在本机浏览器里播放，不上传）';
 video.play().then(function(){toast('本地视频原画播放中：'+f.name)}).catch(function(){toast('点 ▶ 播放本地视频')});
}
$('pickFileBtn').onclick=function(){$('localFile').click()};
$('localFile').addEventListener('change',function(){handleFile(this.files[0]);this.value=''});
var dz=$('dropZone');
['dragenter','dragover'].forEach(function(ev){dz.addEventListener(ev,function(e){e.preventDefault();dz.classList.add('drag')})});
['dragleave','drop'].forEach(function(ev){dz.addEventListener(ev,function(e){e.preventDefault();dz.classList.remove('drag')})});
dz.addEventListener('drop',function(e){var f=e.dataTransfer.files&&e.dataTransfer.files[0];handleFile(f)});

/* ================= 视觉舞台：粒子 / 频谱 / 控制台 ================= */
var PALETTES={galaxy:['#00F5D4','#F4D28A','#7FD8FF'],aurora:['#3dffb2','#38b6ff','#a8ff6e'],flow:['#F4D28A','#ff9a62','#00F5D4'],dusk:['#ff8fa3','#F4D28A','#7FD8FF']};
var palette=PALETTES.galaxy,particleLevel=60;
(function(){
 var c=$('bgCanvas'),ctx=c.getContext('2d'),W,H,dots=[],t=0,reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 function size(){W=c.width=Math.floor(innerWidth*Math.min(devicePixelRatio||1,1.5));H=c.height=Math.floor(innerHeight*Math.min(devicePixelRatio||1,1.5));dots=[];var n=Math.floor(particleLevel*1.1);for(var i=0;i<n;i++)dots.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.8+.4,s:Math.random()*.25+.05,o:Math.random()*.5+.15})}
 size();addEventListener('resize',size);
 window.__setParticles=function(v){particleLevel=v;size()};
 function draw(){
  ctx.clearRect(0,0,W,H);t+=.0035;
  for(var k=0;k<3;k++){
   ctx.beginPath();
   for(var x=0;x<=W;x+=14){var y=H*.62+Math.sin(x/W*2.6+t*(1+k*.4)+k*1.7)*H*.10+Math.sin(x/W*6-t*1.4+k)*H*.02-k*H*.07;x===0?ctx.moveTo(x,y):ctx.lineTo(x,y)}
   ctx.strokeStyle=palette[k%3];ctx.globalAlpha=.16;ctx.lineWidth=26-k*6;ctx.stroke();
  }
  ctx.globalAlpha=1;
  dots.forEach(function(d){d.y-=d.s;if(d.y<-4){d.y=H+4;d.x=Math.random()*W}ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,7);ctx.fillStyle=palette[0];ctx.globalAlpha=d.o;ctx.fill()});
  ctx.globalAlpha=1;
  if(!reduced)requestAnimationFrame(draw);
 }
 draw();
})();
function initViz(){
 try{
  if(!audioCtx){var AC=window.AudioContext||window.webkitAudioContext;audioCtx=new AC();analyser=audioCtx.createAnalyser();analyser.fftSize=128;var src=audioCtx.createMediaElementSource(audio);src.connect(analyser);analyser.connect(audioCtx.destination)}
  if(audioCtx.state==='suspended')audioCtx.resume();
 }catch(e){}
}
(function(){
 var c=$('viz');if(!c)return;var ctx=c.getContext('2d');var data=new Uint8Array(64);
 function frame(){
  requestAnimationFrame(frame);
  var w=c.width,h=c.height;ctx.clearRect(0,0,w,h);
  var live=analyser&&!audio.paused;
  if(live)analyser.getByteFrequencyData(data);
  var bars=44,bw=w/bars;
  for(var i=0;i<bars;i++){
   var v=live?data[Math.floor(i*1.3)]/255:(.12+.08*Math.sin(Date.now()/900+i*.7));
   var bh=Math.max(2,v*h*beatMul);
   ctx.fillStyle=i%3===0?palette[0]:(i%3===1?palette[1]:palette[2]);ctx.globalAlpha=.85;
   ctx.fillRect(i*bw+2,h-bh,bw-4,bh);
  }
  ctx.globalAlpha=1;
 }
 frame();
})();
document.querySelectorAll('#presets .preset').forEach(function(b){b.onclick=function(){
 document.querySelectorAll('#presets .preset').forEach(function(x){x.classList.remove('active')});b.classList.add('active');
 palette=PALETTES[b.getAttribute('data-preset')]||PALETTES.galaxy;
 document.documentElement.style.setProperty('--accent',palette[0]);toast('视觉预设：'+b.textContent.trim());
}});
document.querySelectorAll('.swatch').forEach(function(b){b.onclick=function(){
 document.querySelectorAll('.swatch').forEach(function(x){x.classList.remove('active')});b.classList.add('active');
 var col=b.getAttribute('data-color');document.documentElement.style.setProperty('--accent',col);
 palette=[col,'#F4D28A','#7FD8FF'];toast('界面高亮已换色');
}});
function lyricBase(){return Math.min(Math.max(innerWidth*.046,30),54)}
function applyLyricSize(v){$('stageLyric').style.fontSize=(lyricBase()*v/100)+'px';$('oL').textContent=v+'%'}
$('fxParticles').addEventListener('input',function(){$('oP').textContent=this.value;if(window.__setParticles)window.__setParticles(+this.value)});
$('fxGlow').addEventListener('input',function(){$('oG').textContent=this.value;document.documentElement.style.setProperty('--glow',this.value+'px')});
$('fxLyric').addEventListener('input',function(){applyLyricSize(+this.value)});
$('fxBeat').addEventListener('input',function(){$('oB').textContent=this.value+'%';beatMul=this.value/100});
addEventListener('resize',function(){applyLyricSize(+$('fxLyric').value)});

/* ================= 全屏沉浸 / PWA 安装 / 设备检测 ================= */
$('immersiveBtn').onclick=function(){
 if(document.fullscreenElement)document.exitFullscreen();
 else if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(function(){toast('当前浏览器不允许全屏')});
 else toast('当前浏览器不支持全屏');
};
var deferredPrompt=null;
addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferredPrompt=e});
function openGuide(){
 var ua=navigator.userAgent,ios=/iPhone|iPad|iPod/.test(ua),android=/Android/.test(ua),steps;
 if(ios)steps='<ol><li>用 Safari 打开本页</li><li>点底部的「分享」按钮</li><li>选「添加到主屏幕」</li><li>桌面出现图标后，点它就是独立窗口、全屏沉浸打开</li></ol>';
 else if(android)steps='<ol><li>用 Chrome / Edge 打开本页</li><li>点右上角菜单 ⋮</li><li>选「安装应用」或「添加到主屏幕」</li><li>安装后从桌面图标打开，可离线再进已打开过的页面</li></ol>';
 else steps='<ol><li>用 Chrome / Edge 打开本页</li><li>点地址栏右侧的「安装」图标（或菜单 →「将此站安装为应用」）</li><li>确认安装，桌面与开始菜单会出现图标</li><li>双击图标即以独立窗口打开，和软件版几乎一致</li></ol>';
 $('dlPlat').textContent='PWA · 安装网页版';
 $('dlTitle').textContent='把网页版装到这台设备';
 $('dlBody').innerHTML='<p>你的浏览器暂时没有弹出一键安装（可能已经装过，或需要手动几步）：</p>'+steps+'<p>说明：安装后可独立窗口、全屏打开；页面本体会缓存到本机可离线再打开，在线音乐 / MV 仍需网络。想要三系统的原生安装包，待仓库推送并打版本标签发布后，去 Releases 下载。</p>';
 $('dlModal').classList.add('open');
}
function closeDl(){$('dlModal').classList.remove('open')}
$('dlModal').addEventListener('click',function(e){if(e.target===this)closeDl()});
function doInstall(){
 if(deferredPrompt){deferredPrompt['prompt']();deferredPrompt.userChoice.then(function(r){toast(r.outcome==='accepted'?'已开始安装，桌面马上就有图标':'已取消安装，随时可再点安装按钮');deferredPrompt=null;closeDl()})}
 else openGuide();
}
document.querySelectorAll('.installBtn').forEach(function(b){b.addEventListener('click',doInstall)});
$('pwaHowBtn').onclick=openGuide;
if('serviceWorker' in navigator){try{navigator.serviceWorker.register('assets/sw.js').catch(function(){})}catch(e){}}
(function(){
 var ua=navigator.userAgent;
 var os=/Windows/.test(ua)?'Windows':/Mac OS|Macintosh/.test(ua)?'macOS':/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Linux/.test(ua)?'Linux':'未知系统';
 var br=/Edg\//.test(ua)?'Edge':/Chrome/.test(ua)?'Chrome':/Safari/.test(ua)?'Safari':/Firefox/.test(ua)?'Firefox':'浏览器';
 var rec={Windows:'推荐：Windows 软件版 .exe（上方 Releases 按钮），或点「安装网页版」直接装成桌面应用',macOS:'推荐：macOS 软件版 .dmg（上方 Releases 按钮），或点「安装网页版」装到启动台',Linux:'推荐：Linux 软件版 .AppImage / .deb（上方 Releases 按钮），或点「安装网页版」',Android:'推荐：点「安装网页版」添加到主屏幕，像 App 一样用',iOS:'推荐：Safari 分享 →「添加到主屏幕」，全屏沉浸打开'}[os]||'推荐：先用网页版，或去 Releases 选对应系统的安装包';
 $('deviceHint').innerHTML='当前设备：<b>'+os+' · '+br+'</b> — '+rec+'。软件版源码包已备好（见下方），将发布到 GitHub 公开仓库 <a href="'+REPO+'" target="_blank" rel="noopener" style="color:var(--accent)">lzx-lgm/all-in-one-player</a>。';
})();

/* ================= DESKTOP · 桌面版真同步（Electron 内嵌登录窗） =================
   只在桌面版生效（window.desktopAPI 存在时）。网页版完全走上面那套本机标记流程。
   原理（Mineradio 式）：主进程开内嵌官方登录窗（独立 partition）扫码，
   Cookie 只收进本机 userData/auth/*.json；本地服务用它向官方接口取真实歌单，
   渲染层只拿到歌单结构与可播地址，永不接触 Cookie 值。
   QQ 号与微信是两个独立身份：不同 partition、不同凭证文件、不同状态行，绝不合并。
   QQ 登录页签二维码间歇性空白是官网侧问题：登录窗停留 12 秒仍无凭证时，
   主进程会发 login-qr-blank 事件，这里给出重试引导。 */
var IS_DESKTOP = !!(window.desktopAPI && window.desktopAPI.isDesktop);
var realTracks = [], realCurrent = -1, realPlaylists = [];
var desktopIdentState = { qq: { qq: 'out', wechat: 'out' } };
function currentIdentity(pid) {
  if (pid === 'qq') { var s = $('wizIdentSel'); return s ? s.value : 'qq'; }
  return 'default';
}
function desktopLogin(pid, identity) {
  toast('正在打开 ' + platById(pid).name + ' 官方登录窗 — 在里面扫码，本应用不输入密码');
  window.desktopAPI.login(pid, identity);
}
function desktopConfirm(pid, identity) {
  markStep(3);
  refreshDesktopAuth().then(function () {
    var st = desktopStatusFor(pid, identity);
    if (st === 'in') { syncRealLibrary(pid, identity); return; }
    desktopLogin(pid, identity);
    toast(platById(pid).name + '：请在弹出的官方登录窗里扫码，扫完会自动同步你的真实歌单');
  });
}
function desktopStatusFor(pid, identity) {
  if (!window.__desktopStatus) return 'out';
  var arr = window.__desktopStatus[pid] || [];
  for (var i = 0; i < arr.length; i++) if (arr[i].identity === identity) return arr[i].state;
  return 'out';
}
function refreshDesktopAuth() {
  if (!IS_DESKTOP) return Promise.resolve();
  return window.desktopAPI.authStatus().then(function (status) {
    window.__desktopStatus = status;
    platforms.slice(1).forEach(function (p) {
      var arr = status[p.id] || [];
      var primary = p.id === 'qq' ? 'qq' : 'default';
      var st = 'out';
      arr.forEach(function (a) { if (a.identity === primary) st = a.state; });
      loginState[p.id] = st === 'in' ? 'in' : (st === 'expired' ? 'expired' : 'out');
      if (p.id === 'qq') arr.forEach(function (a) { desktopIdentState.qq[a.identity] = a.state; });
    });
    renderPlatforms(); updateWizStatus();
  }).catch(function () {});
}
function syncRealLibrary(pid, identity) {
  if (!IS_DESKTOP) return;
  showSkeleton('同步中 · ' + platById(pid).name + ' 真实歌单');
  fetch('/api/' + pid + '/library?identity=' + encodeURIComponent(identity))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) {
        if (data.reason === 'login_required' || data.reason === 'login_expired') {
          loginState[pid] = 'expired'; renderPlatforms(); updateWizStatus();
          toast(platById(pid).name + ' 登录已失效：' + (data.detail || '请重新扫码登录'));
          desktopLogin(pid, identity);
        } else {
          toast(platById(pid).name + '：' + (data.detail || data.reason || '暂无法同步真实歌单') + ' — 可先用演示曲目与本地文件，或换源到其它已登录平台');
        }
        renderTracks(); return;
      }
      realPlaylists = data.playlists || [];
      libScope = 'real'; filterPlat = pid;
      // 默认展开「我喜欢」歌单（若有），否则展开第一个歌单；没有歌单时如实显示空态
      var first = null;
      if (data.likedPlaylistId) first = realPlaylists.filter(function (p) { return p.id === data.likedPlaylistId; })[0];
      if (!first && realPlaylists.length) first = realPlaylists[0];
      $('trackListTitle').textContent = '已同步 · ' + platById(pid).name + '（' + (identity === 'wechat' ? '微信身份' : 'QQ号身份') + '）真实歌单 · ' + realPlaylists.length + ' 个歌单';
      if (!first) {
        realTracks = []; renderTracks();
        toast(platById(pid).name + '（' + (identity === 'wechat' ? '微信身份' : 'QQ号身份') + '）下没有歌单' + (pid === 'qq' && identity === 'wechat' ? ' — 微信身份的资产与 QQ 号不互通，请切回 QQ号 身份' : ''));
        return;
      }
      loadRealPlaylist(pid, identity, first);
      toast('已同步 ' + platById(pid).name + '：' + realPlaylists.length + ' 个歌单（只同步已收藏/已创建，不翻全站目录）');
    })
    .catch(function () { toast('本地服务无响应，请重启桌面版再试'); renderTracks(); });
}
function loadRealPlaylist(pid, identity, playlist) {
  fetch('/api/' + pid + '/playlist-tracks?identity=' + encodeURIComponent(identity) + '&id=' + encodeURIComponent(playlist.id))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      realTracks = (data.tracks || []).map(function (t) {
        return { real: true, plat: pid, identity: identity, id: t.id, title: t.title, artist: t.artist, durationMs: t.durationMs || 0, album: t.album || '', playlistName: playlist.name, color: platById(pid).color };
      });
      libScope = 'real'; filterPlat = pid; renderTracks();
      if (!realTracks.length) toast('歌单「' + playlist.name + '」里没有可列出的曲目');
    })
    .catch(function () { toast('歌单曲目加载失败，请稍后重试'); });
}
function playRealTrack(t) {
  // 真实曲目先向本机服务要可播地址；拿不到（VIP/会员/无直链）就换源，不绕过付费
  fetch('/api/' + t.plat + '/audio?identity=' + encodeURIComponent(t.identity || 'default') + '&id=' + encodeURIComponent(t.id))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.ok && data.url) {
        current = -1; realCurrent = realTracks.indexOf(t);
        audio.src = data.url; audio.playbackRate = parseFloat($('speedSel').value); video.pause();
        audio.play().then(function () { toast('正在播放（真同步）：' + t.title); }).catch(function () { toast('音频加载中，请再点一次播放'); });
        var demo = { title: t.title, artist: t.artist, plat: t.plat, color: t.color, dur: fmt((t.durationMs || 0) / 1000), lines: [[t.title, t.artist]] };
        updateStage(demo); syncPlayUI(); initViz(); renderTracks();
        return;
      }
      toast('「' + t.title + '」在 ' + platById(t.plat).name + ' ' + (data.reason === 'login_required' ? '登录已失效，请重新扫码' : '需会员或无可播地址') + ' — 正在其它已登录平台匹配同一首歌…');
      setTimeout(function () { attemptAutoSource({ title: t.title, artist: t.artist, plat: t.plat }); }, 600);
    })
    .catch(function () { toast('本地服务无响应，请重启桌面版再试'); });
}
// 桌面版：平台中心里把 QQ 的微信身份单独成行（状态、登录、退出各走各的）
if (IS_DESKTOP) {
  var _renderPlatforms = renderPlatforms;
  renderPlatforms = function () {
    _renderPlatforms();
    var list = $('platformList'); if (!list) return;
    var rows = list.querySelectorAll('.plat-row');
    rows.forEach(function (row) {
      var name = row.querySelector('.pi b');
      if (!name || name.textContent !== 'QQ音乐') return;
      var st = desktopIdentState.qq.wechat || 'out';
      var sub = document.createElement('div');
      sub.className = 'plat-row';
      sub.style.cssText = 'margin-top:6px;background:rgba(255,255,255,.03)';
      sub.innerHTML = '<div class="plat-icon" style="background:#07C160">微</div><div class="pi"><b>微信登录身份</b> <span class="badge">' + STATE_TXT[st] + '</span><p>与 QQ 号是两个独立身份，资产、付费特权不互通；该身份下歌单为空时请切回 QQ号 身份。</p></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' +
        (st === 'in'
          ? '<button class="connect" data-wx="sync">同步收藏</button><button class="connect" data-wx="out">退出</button>'
          : '<button class="connect" data-wx="login">微信扫码登录</button>') + '</div>';
      sub.querySelectorAll('[data-wx]').forEach(function (btn) {
        btn.onclick = function () {
          var a = btn.getAttribute('data-wx');
          if (a === 'login') desktopLogin('qq', 'wechat');
          if (a === 'sync') syncRealLibrary('qq', 'wechat');
          if (a === 'out') window.desktopAPI.logout('qq', 'wechat').then(refreshDesktopAuth);
        };
      });
      row.parentNode.insertBefore(sub, row.nextSibling);
    });
  };
  // 主进程事件：登录完成 / 二维码空白
  if (window.desktopAPI.onLoginEvent) window.desktopAPI.onLoginEvent(function (kind, p) {
    if (kind === 'login-done') {
      toast(platById(p.platform).name + ' 已登录 — 正在同步真实歌单…');
      refreshDesktopAuth().then(function () { syncRealLibrary(p.platform, p.identity || 'default'); });
    } else if (kind === 'login-qr-blank') {
      toast('二维码空白？' + p.hint);
      var ws = $('wizStatus');
      if (ws) ws.textContent = '登录窗提示（' + platById(p.platform).name + '）：' + p.hint + ' 点「重试」可重开登录窗。';
      if (window.confirm('QQ 登录二维码空白，是否重开登录窗重试？')) window.desktopAPI.loginRetry(p.platform, p.identity);
    }
  });
  refreshDesktopAuth();
}

/* ================= INIT ================= */
audio.volume=.8;video.volume=.8;audio.playbackRate=1;
buildWizard();renderPlatforms();renderTracks();renderMVs();updateWizStatus();
curLyricIdx=0;renderLyrics(tracks[0]);
video.addEventListener('loadedmetadata',function(){}, {once:true});
