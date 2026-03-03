import './style.css'
import { auth, db } from './firebase'
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, signOut
} from 'firebase/auth'
import {
  collection, query, where, onSnapshot, orderBy, doc, addDoc,
  serverTimestamp, getDoc, setDoc, updateDoc, getDocs, limit
} from 'firebase/firestore'

const app = document.querySelector<HTMLDivElement>('#app')!
const APP_VERSION = "v1.0.1-1b"

// --- Global State ---
let currentTheme = localStorage.getItem('jus-theme') || 'purple'
let fontConfig: Record<string, string> = JSON.parse(localStorage.getItem('jus-fonts') || '{}')
let colorOverrides: Record<string, string> = JSON.parse(localStorage.getItem('jus-colors') || '{}')

const FONTS = ['Poppins', 'JetBrains Mono', 'Roboto', 'Montserrat', 'Inter']
const FONT_TARGETS = ['global', 'chat', 'titles', 'settings']
const COLOR_VARS = ['background', 'surface', 'primary', 'secondary', 'on-surface', 'sent-bubble', 'received-bubble']

// --- Initial Setup ---
function applyTheme() {
  document.body.setAttribute('data-theme', currentTheme)

  // Apply Font Targets
  FONT_TARGETS.forEach(target => {
    const font = fontConfig[target] || (target === 'chat' ? 'JetBrains Mono' : 'Poppins')
    document.documentElement.style.setProperty(`--font-${target}`, `'${font}', ${target === 'chat' ? 'monospace' : 'sans-serif'}`)
  })

  // Apply Color Overrides
  COLOR_VARS.forEach(v => {
    if (colorOverrides[v]) {
      document.documentElement.style.setProperty(`--${v}`, colorOverrides[v])
    } else {
      document.documentElement.style.removeProperty(`--${v}`)
    }
  })
}

async function renderApp() {
  onAuthStateChanged(auth, (user) => {
    if (user) { renderDashboard(user) }
    else { renderAuth(false) }
  })
}

// --- Auth ---
function renderAuth(isSignup: boolean) {
  applyTheme()
  app.innerHTML = `
    <div class="auth-container fade-in">
      <img src="./logo.png" alt="JusChatz Logo" class="logo">
      <h1 style="font-size: 2.5rem; margin-bottom: 30px; color: var(--primary); font-weight:800; font-family: var(--font-titles);">JusChatz</h1>
      <div class="glass" style="width: 100%; max-width: 400px; padding: 40px; border-radius: 28px; display: flex; flex-direction: column; gap: 16px;">
        <h2 style="text-align:center; margin-bottom:10px;">${isSignup ? 'Create Account' : 'Welcome Back'}</h2>
        ${isSignup ? `
          <input type="text" id="disp-name" class="input-field" placeholder="Display Name">
          <input type="text" id="username" class="input-field" placeholder="Username (@handle)">
        ` : ''}
        <input type="email" id="email" class="input-field" placeholder="Email Address">
        <input type="password" id="password" class="input-field" placeholder="Password">
        <button id="auth-btn" class="premium-btn" style="margin-top:10px;">${isSignup ? 'Sign Up' : 'Sign In'}</button>
        <p style="text-align: center; font-size: 0.9rem; color: var(--text-dim);">
          ${isSignup ? 'Already have an account?' : "Don't have an account?"} 
          <a href="#" id="toggle-auth" style="color: var(--primary); text-decoration: none; font-weight: 600;">${isSignup ? 'Sign In' : 'Sign Up'}</a>
        </p>
        <p id="error-msg" style="color: var(--error); font-size: 0.8rem; text-align: center; height: 1.2rem;"></p>
      </div>
    </div>
  `
  const authBtn = document.querySelector('#auth-btn')!
  const toggleLink = document.querySelector('#toggle-auth')!
  toggleLink.addEventListener('click', (e) => { e.preventDefault(); renderAuth(!isSignup); })

  authBtn.addEventListener('click', async () => {
    const errorMsg = document.querySelector('#error-msg')!
    const email = (document.querySelector('#email') as HTMLInputElement).value
    const password = (document.querySelector('#password') as HTMLInputElement).value
    try {
      if (isSignup) {
        const displayName = (document.querySelector('#disp-name') as HTMLInputElement).value
        const username = (document.querySelector('#username') as HTMLInputElement).value.toLowerCase().trim()
        if (!displayName || !username) throw new Error("Missing info")
        const q = query(collection(db, "users"), where("username", "==", username))
        const existing = await getDocs(q)
        if (!existing.empty) throw new Error("Username taken")
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid, displayName, username, email, photoUrl: "", bannerUrl: "", bio: "Hey there!",
          online: true, lastSeen: Date.now(), usernameChangeTimestamps: []
        })
      } else { await signInWithEmailAndPassword(auth, email, password) }
    } catch (e: any) { errorMsg.textContent = e.message }
  })
}

// --- Dashboard ---
async function renderDashboard(user: any) {
  applyTheme()
  app.innerHTML = `
    <div class="fade-in" style="display: flex; height: 100vh; width: 100%;">
      <div class="glass" style="width: 380px; border-right: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; background: var(--background);">
        <div style="padding: 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.03);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="./logo.png" style="width: 34px; height: 34px;">
            <h2 style="font-size: 1.25rem; font-family: var(--font-titles);">JusChatz</h2>
          </div>
          <div style="display: flex; gap: 8px;">
             <button id="find-btn" title="Search" class="glass" style="padding: 8px; border-radius: 50%; cursor: pointer;">🔍</button>
             <button id="group-btn" title="Groups" class="glass" style="padding: 8px; border-radius: 50%; cursor: pointer;">👥</button>
             <button id="settings-btn" title="Settings" class="glass" style="padding: 8px; border-radius: 50%; cursor: pointer;">⚙️</button>
          </div>
        </div>
        <div id="chat-list" style="flex: 1; overflow-y: auto; padding: 16px;"></div>
        <div style="padding: 16px; border-top: 1px solid rgba(255,255,255,0.03); display: flex; align-items: center; gap: 12px;">
           <div class="avatar-container" id="my-profile-btn" style="cursor:pointer; width: 40px; height: 40px;">
              <img id="my-pfp" src="">
           </div>
           <p id="my-name" style="flex:1; font-weight: 600; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">...</p>
           <button id="logout-btn" style="background:none; border:none; color:var(--text-dim); cursor:pointer;">Logout</button>
        </div>
      </div>
      <div id="chat-area" style="flex: 1; display: flex; flex-direction: column; background: var(--background);">
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; opacity:0.1;">
          <img src="./logo.png" style="width:120px; filter:grayscale(1);">
          <h3 style="font-family: var(--font-titles);">JusChatz Web</h3>
        </div>
      </div>
    </div>
    <div id="modal-root"></div>
  `

  const userDoc = await getDoc(doc(db, "users", user.uid))
  if (userDoc.exists()) {
    const d = userDoc.data()
    document.querySelector<HTMLElement>('#my-name')!.textContent = d.displayName
    document.querySelector<HTMLImageElement>('#my-pfp')!.src = d.photoUrl ? `data:image/jpeg;base64,${d.photoUrl}` : 'https://ui-avatars.com/api/?name=' + d.displayName
  }

  document.querySelector('#logout-btn')?.addEventListener('click', () => signOut(auth))
  document.querySelector('#settings-btn')?.addEventListener('click', () => renderSettings(user))
  document.querySelector('#find-btn')?.addEventListener('click', () => renderSearch(user))
  document.querySelector('#group-btn')?.addEventListener('click', () => renderCreateGroup(user))
  document.querySelector('#my-profile-btn')?.addEventListener('click', () => renderSettings(user))

  loadChats(user.uid)
}

// --- Image Compression ---
async function compressImage(file: File, size: number): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        let w = img.width, h = img.height
        if (w > h) { if (w > size) { h *= size / w; w = size; } }
        else { if (h > size) { w *= size / h; h = size; } }
        canvas.width = w; canvas.height = h
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1])
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}

// --- User Profile / Bio Viewer ---
async function viewUserProfile(uid: string) {
  const root = document.querySelector('#modal-root')!
  const docRef = doc(db, "users", uid)
  const d = (await getDoc(docRef)).data()!
  root.innerHTML = `
    <div class="settings-overlay">
      <div class="modal fade-in" style="max-width: 400px; text-align: center;">
        <div style="position:relative; height:100px; margin-bottom:50px; background:var(--surface-variant); border-radius:16px;">
          <img src="${d.bannerUrl ? `data:image/jpeg;base64,${d.bannerUrl}` : ''}" style="width:100%; height:100%; object-fit:cover; border-radius:16px; display:${d.bannerUrl ? 'block' : 'none'}">
          <div style="position:absolute; bottom:-35px; left:50%; transform:translateX(-50%); width:70px; height:70px; border-radius:50%; border:4px solid var(--background); background:var(--surface); overflow:hidden;">
            <img src="${d.photoUrl ? `data:image/jpeg;base64,${d.photoUrl}` : 'https://ui-avatars.com/api/?name=' + d.displayName}" style="width:100%; height:100%; object-fit:cover;">
          </div>
        </div>
        <h3>${d.displayName}</h3>
        <p style="color:var(--text-dim); font-size:0.8rem; margin-top:4px;">@${d.username}</p>
        <p style="padding: 20px; font-size: 0.9rem;">${d.bio || 'No bio yet.'}</p>
        <button id="close-view" class="premium-btn" style="width:100%;">Close</button>
      </div>
    </div>
  `
  root.querySelector('#close-view')?.addEventListener('click', () => root.innerHTML = '')
}
(window as any).viewUserProfile = viewUserProfile

// --- User Search ---
async function renderSearch(user: any) {
  const root = document.querySelector('#modal-root')!
  root.innerHTML = `
    <div class="settings-overlay">
      <div class="modal fade-in">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="font-family: var(--font-titles);">Find Friends</h2>
          <button id="close" style="background:none; border:none; color:#fff; cursor:pointer; font-size:1.5rem;">&times;</button>
        </div>
        <input type="text" id="q" class="input-field" placeholder="Search @username or name..." style="margin-top:10px;">
        <div id="res" style="display:flex; flex-direction:column; gap:10px; margin-top:20px; max-height:300px; overflow-y:auto;"></div>
      </div>
    </div>
  `
  const q = document.querySelector('#q') as HTMLInputElement
  const r = document.querySelector('#res')!
  q.addEventListener('input', async () => {
    const val = q.value.trim().toLowerCase()
    if (val.length < 2) { r.innerHTML = ''; return; }
    r.innerHTML = '<p style="text-align:center;">Searching...</p>'
    const snap = await getDocs(query(collection(db, "users"), where("username", ">=", val), where("username", "<=", val + '\uf8ff'), limit(10)))
    r.innerHTML = snap.docs.filter(d => d.id !== user.uid).map(d => {
      const u = d.data()
      return `
        <div class="chat-item" onclick="startChat('${u.uid}', '${u.displayName}', '${u.photoUrl}')" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05);">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="avatar-container"><img src="${u.photoUrl ? `data:image/jpeg;base64,${u.photoUrl}` : 'https://ui-avatars.com/api/?name=' + u.displayName}"></div>
            <div><p style="font-weight:600;">${u.displayName}</p><p style="font-size:0.8rem; color:var(--text-dim);">@${u.username}</p></div>
          </div>
        </div>
      `
    }).join('') || '<p style="text-align:center; color:var(--text-dim);">No one found.</p>'
  })
  root.querySelector('#close')?.addEventListener('click', () => root.innerHTML = '')
}
(window as any).startChat = async (otherUid: string, otherName: string, otherPhoto: string) => {
  const meUid = auth.currentUser!.uid
  const q = query(collection(db, "chats"), where("participants", "array-contains", meUid))
  const snap = await getDocs(q)
  const existing = snap.docs.find(d => { const p = d.data().participants; return p.includes(otherUid) && p.length === 2 && !d.data().isGroup })
  if (existing) { renderChatArea(existing.id, meUid); document.querySelector('#modal-root')!.innerHTML = ''; return; }
  const meData = (await getDoc(doc(db, "users", meUid))).data()!
  const ref = await addDoc(collection(db, "chats"), {
    participants: [meUid, otherUid],
    participantNames: { [meUid]: meData.displayName, [otherUid]: otherName },
    participantPhotos: { [meUid]: meData.photoUrl, [otherUid]: otherPhoto },
    lastMessage: "New conversation", lastMessageTimestamp: Date.now(), isGroup: false
  })
  document.querySelector('#modal-root')!.innerHTML = ''; renderChatArea(ref.id, meUid)
}

// --- Settings ---
async function renderSettings(user: any) {
  const root = document.querySelector('#modal-root')!
  const d = (await getDoc(doc(db, "users", user.uid))).data()!

  const fontOptions = (target: string) => FONTS.map(f => `<option value="${f}" ${fontConfig[target] === f ? 'selected' : (target === 'chat' && f === 'JetBrains Mono' && !fontConfig[target] ? 'selected' : (target !== 'chat' && f === 'Poppins' && !fontConfig[target] ? 'selected' : ''))}>${f}</option>`).join('')
  const colorInputs = COLOR_VARS.map(v => `
    <div>
      <label style="font-size:0.6rem; color:var(--text-dim); text-transform:uppercase;">${v.replace('-', ' ')}</label>
      <input type="text" class="color-override input-field" data-var="${v}" style="padding:8px; font-size:0.8rem;" placeholder="#RRGGBB" value="${colorOverrides[v] || ''}">
    </div>
  `).join('')

  root.innerHTML = `
    <div class="settings-overlay">
      <div class="modal fade-in" style="max-width: 600px; padding: 40px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="font-family: var(--font-settings);">Settings</h2>
          <button id="cls" style="background:none; border:none; color:#fff; cursor:pointer; font-size:1.8rem;">&times;</button>
        </div>
        
        <div id="settings-tabs" style="display:flex; gap:20px; border-bottom:1px solid rgba(255,255,255,0.05); margin-bottom:20px;">
           <p class="tab active" data-tab="profile" style="padding:10px 0; cursor:pointer; font-weight:700;">Profile</p>
           <p class="tab" data-tab="appearance" style="padding:10px 0; cursor:pointer; font-weight:700;">Appearance</p>
        </div>

        <div id="tab-profile" class="tab-content fade-in">
          <div style="position:relative; height:140px; margin-bottom:70px;">
            <div id="ban-up" title="Change Banner" style="width:100%; height:100%; border-radius:20px; background:var(--surface-variant); cursor:pointer; overflow:hidden;">
              <img id="set-ban" src="${d.bannerUrl ? `data:image/jpeg;base64,${d.bannerUrl}` : ''}" style="width:100%; height:100%; object-fit:cover; display:${d.bannerUrl ? 'block' : 'none'}">
            </div>
            <div id="pfp-up" title="Change Avatar" style="position:absolute; bottom:-45px; left:25px; width:95px; height:95px; border-radius:50%; border:5px solid var(--background); background:var(--surface); cursor:pointer; overflow:hidden;">
              <img id="set-pfp" src="${d.photoUrl ? `data:image/jpeg;base64,${d.photoUrl}` : 'https://ui-avatars.com/api/?name=' + d.displayName}" style="width:100%; height:100%; object-fit:cover;">
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:12px;">
             <label class="section-label">Account Details</label>
             <input type="text" id="s-name" class="input-field" value="${d.displayName}" placeholder="Display Name">
             <input type="text" id="s-username" class="input-field" value="@${d.username}" placeholder="Change username (@handle)">
             <textarea id="s-bio" class="input-field" style="height:100px; resize:none;" placeholder="Tell us more about yourself...">${d.bio || ''}</textarea>
          </div>
        </div>

        <div id="tab-appearance" class="tab-content fade-in" style="display:none;">
          <label class="section-label">General Mode</label>
          <select id="s-th" class="input-field" style="margin-bottom:20px;">
            <option value="purple" ${currentTheme === 'purple' ? 'selected' : ''}>Purple (JusDots)</option>
            <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>Dark Mode</option>
            <option value="dark_flat" ${currentTheme === 'dark_flat' ? 'selected' : ''}>Dark Flat</option>
            <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>Light Theme</option>
          </select>

          <label class="section-label">Font Targets</label>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:20px;">
            ${FONT_TARGETS.map(t => `<div><label style="font-size:0.6rem; color:var(--text-dim); text-transform:uppercase;">${t}</label><select class="font-sel input-field" data-target="${t}">${fontOptions(t)}</select></div>`).join('')}
          </div>

          <label class="section-label">Custom Hex Overrides</label>
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:10px;">
            ${colorInputs}
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:30px; padding-top:20px; border-top:1px solid rgba(255,255,255,0.05);">
           <p style="font-size:0.7rem; color:var(--text-dim);">JusChatz ${APP_VERSION}</p>
           <button id="s-save" class="premium-btn">Save & Apply</button>
        </div>
      </div>
    </div>
  `

  root.querySelector('#cls')?.addEventListener('click', () => root.innerHTML = '')

  // Tab logic
  root.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    root.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); t.classList.add('active')
    root.querySelectorAll('.tab-content').forEach(c => (c as HTMLElement).style.display = 'none')
    root.querySelector<HTMLElement>(`#tab-${(t as HTMLElement).dataset.tab}`)!.style.display = 'block'
  }))

  const handleUp = (isPfp: boolean) => {
    const inv = document.createElement('input'); inv.type = 'file'; inv.accept = 'image/*';
    inv.onchange = async () => {
      const f = inv.files?.[0]; if (!f) return;
      const base64 = await compressImage(f, isPfp ? 200 : 800)
      await updateDoc(doc(db, "users", user.uid), { [isPfp ? 'photoUrl' : 'bannerUrl']: base64 })
      if (isPfp) (root.querySelector('#set-pfp') as HTMLImageElement).src = `data:image/jpeg;base64,${base64}`
      else { const b = root.querySelector('#set-ban') as HTMLImageElement; b.src = `data:image/jpeg;base64,${base64}`; b.style.display = 'block'; }
    }; inv.click()
  }
  root.querySelector('#pfp-up')?.addEventListener('click', () => handleUp(true))
  root.querySelector('#ban-up')?.addEventListener('click', () => handleUp(false))

  root.querySelector('#s-save')?.addEventListener('click', async () => {
    const btn = root.querySelector('#s-save') as HTMLButtonElement; btn.disabled = true; btn.textContent = 'Saving...';

    const nm = (root.querySelector('#s-name') as HTMLInputElement).value
    const bi = (root.querySelector('#s-bio') as HTMLTextAreaElement).value
    const th = (root.querySelector('#s-th') as HTMLSelectElement).value

    // Fonts
    const newFonts: Record<string, string> = {}
    root.querySelectorAll('.font-sel').forEach(s => {
      const sel = s as HTMLSelectElement; newFonts[sel.dataset.target!] = sel.value
    })

    // Colors
    const newColors: Record<string, string> = {}
    root.querySelectorAll('.color-override').forEach(i => {
      const inp = i as HTMLInputElement; if (inp.value.startsWith('#')) newColors[inp.dataset.var!] = inp.value
    })

    await updateDoc(doc(db, "users", user.uid), { displayName: nm, bio: bi })

    currentTheme = th; localStorage.setItem('jus-theme', th)
    fontConfig = newFonts; localStorage.setItem('jus-fonts', JSON.stringify(fontConfig))
    colorOverrides = newColors; localStorage.setItem('jus-colors', JSON.stringify(colorOverrides))

    applyTheme()
    root.innerHTML = ''; renderDashboard(user)
  })
}

// --- Groups & Chats ---
async function renderCreateGroup(user: any) {
  const root = document.querySelector('#modal-root')!
  root.innerHTML = `
    <div class="settings-overlay">
      <div class="modal fade-in">
        <h2>New Group</h2>
        <input id="gn" class="input-field" placeholder="Cool Group Name...">
        <div style="height:150px; display:flex; align-items:center; justify-content:center; color:var(--text-dim); opacity:0.5; font-size:0.9rem;">
           Select members logic coming soon...
        </div>
        <div style="display:flex; gap:12px;">
          <button id="cx" class="input-field" style="width:auto; cursor:pointer;">Cancel</button>
          <button id="gc" class="premium-btn" style="flex:1;">Create Group</button>
        </div>
      </div>
    </div>
  `
  root.querySelector('#cx')?.addEventListener('click', () => root.innerHTML = '')
  root.querySelector('#gc')?.addEventListener('click', async () => {
    const n = (root.querySelector('#gn') as HTMLInputElement).value; if (!n) return
    const me = (await getDoc(doc(db, "users", user.uid))).data()!
    const r = await addDoc(collection(db, "chats"), {
      isGroup: true, groupName: n, groupAdminId: user.uid, participants: [user.uid],
      participantNames: { [user.uid]: me.displayName }, participantPhotos: { [user.uid]: me.photoUrl },
      lastMessage: "Group created", lastMessageTimestamp: Date.now()
    })
    root.innerHTML = ''; renderChatArea(r.id, user.uid)
  })
}

function loadChats(uid: string) {
  const l = document.querySelector('#chat-list')!
  const q = query(collection(db, "chats"), where("participants", "array-contains", uid), orderBy("lastMessageTimestamp", "desc"))
  onSnapshot(q, (snap) => {
    l.innerHTML = snap.docs.map(d => {
      const c = d.data(); const isG = c.isGroup
      const n = isG ? c.groupName : (Object.values(c.participantNames).find((_, i) => Object.keys(c.participantNames)[i] !== uid) || "User")
      const p = isG ? "" : (Object.values(c.participantPhotos).find((_, i) => Object.keys(c.participantPhotos)[i] !== uid) || "")
      return `
        <div class="chat-item" data-id="${d.id}" style="border:1px solid rgba(255,255,255,0.03);">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="avatar-container"><img src="${p ? `data:image/jpeg;base64,${p}` : 'https://ui-avatars.com/api/?name=' + n}"></div>
            <div style="flex:1; min-width:0;"><p style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n}</p><p style="font-size:0.8rem; color:var(--text-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c.lastMessage || ''}</p></div>
          </div>
        </div>
      `
    }).join('') || '<p style="text-align:center; padding:40px; color:var(--text-dim);">No chats yet.</p>'
    l.querySelectorAll('.chat-item').forEach(i => i.addEventListener('click', () => {
      l.querySelectorAll('.chat-item').forEach(x => x.classList.remove('active')); i.classList.add('active')
      renderChatArea((i as HTMLElement).dataset.id!, uid)
    }))
  }, (e) => {
    l.innerHTML = `<div style="padding:20px; color:var(--error); font-size:0.75rem; text-align:center;">
       <p>⚠️ Firestore Index Needed</p><p style="opacity:0.5; font-size:0.6rem;">${e.message}</p>
    </div>`
  })
}

async function renderChatArea(chatId: string, uid: string) {
  const a = document.querySelector('#chat-area')!
  const chatDoc = await getDoc(doc(db, "chats", chatId)); if (!chatDoc.exists()) return
  const d = chatDoc.data()!
  const name = d.isGroup ? d.groupName : (Object.values(d.participantNames).find((_, i) => Object.keys(d.participantNames)[i] !== uid) || "User")
  a.innerHTML = `
    <div style="padding:16px 24px; border-bottom:1px solid rgba(255,255,255,0.03); display:flex; align-items:center; justify-content:space-between; background:var(--background);">
       <h3 style="font-family: var(--font-titles);">${name}</h3>
       ${d.isGroup ? `<button id="vi-gp" style="background:var(--surface-variant); color:var(--on-surface); border:none; padding:4px 12px; border-radius:12px; cursor:pointer; font-size:0.75rem;">View Group</button>` : ''}
    </div>
    <div id="feed" style="flex:1; overflow-y:auto; padding:24px; display:flex; flex-direction:column; gap:8px;"></div>
    <div style="padding:20px; background:var(--background);"><div style="display:flex; gap:12px;"><input id="mi" class="input-field" placeholder="Type a message..." autocomplete="off"><button id="ms" class="premium-btn">Send</button></div></div>
  `

  if (d.isGroup) {
    document.querySelector('#vi-gp')?.addEventListener('click', () => {
      const list = Object.entries(d.participantNames).map(([id, name]) => `<div style="display:flex; align-items:center; gap:10px; padding:10px; cursor:pointer;" onclick="viewUserProfile('${id}')"><p>${name}</p></div>`).join('')
      const root = document.querySelector('#modal-root')!;
      root.innerHTML = `<div class="settings-overlay"><div class="modal"><h3>Participants</h3><div style="margin:10px 0;">${list}</div><button id="cx-gp" class="premium-btn">Close</button></div></div>`
      root.querySelector('#cx-gp')?.addEventListener('click', () => root.innerHTML = '')
    })
  }

  const f = document.querySelector('#feed')!
  onSnapshot(query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc")), (s) => {
    f.innerHTML = s.docs.map(m => {
      const msg = m.data(); const me = msg.senderId === uid
      return `<div class="message-bubble ${me ? 'me' : 'them'}" style="font-family:var(--font-chat);">
        ${d.isGroup && !me ? `<p style="font-size:0.7rem; font-weight:700; color:var(--primary); cursor:pointer;" onclick="viewUserProfile('${msg.senderId}')">${msg.senderName}</p>` : ''}
        ${msg.text}
      </div>`
    }).join('')
    f.scrollTop = f.scrollHeight
  })
  const s = async () => {
    const i = document.querySelector('#mi') as HTMLInputElement; const text = i.value.trim(); if (!text) return; i.value = ""
    await addDoc(collection(db, "chats", chatId, "messages"), { senderId: uid, text, timestamp: serverTimestamp(), senderName: auth.currentUser?.displayName })
    await updateDoc(doc(db, "chats", chatId), { lastMessage: text, lastMessageTimestamp: Date.now() })
  }
  document.querySelector('#ms')?.addEventListener('click', s)
  document.querySelector('#mi')?.addEventListener('keypress', (e: any) => e.key === 'Enter' && s())
}

renderApp()
