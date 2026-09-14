import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bell, Camera, ChevronRight, Clock3, Flame, FolderHeart, History, ImagePlus, Leaf, LogOut, Menu, Plus, Search, Settings, Sparkles, UsersRound, X, Check, Utensils, LayoutDashboard, LockKeyhole, Mail, Eye, EyeOff, MessageCircle, ClipboardList, ShieldCheck, UserRound } from 'lucide-react';
import './styles.css';
import { supabase } from './supabase';

const samplePosts = [];
const getOrCreateMembership = async (user) => {
  if (!user) throw new Error('Login required.');
  const { data: membership, error: membershipError } = await supabase
    .from('center_members')
    .select('center_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (membership) return membership;

  const { data: center, error: centerError } = await supabase
    .from('centers')
    .insert({ name: 'Anganwadi Center' })
    .select('id')
    .single();
  if (centerError) throw centerError;

  const { data: newMembership, error: newMembershipError } = await supabase
    .from('center_members')
    .insert({ center_id: center.id, user_id: user.id, role: 'worker' })
    .select('center_id, role')
    .single();
  if (newMembershipError) throw newMembershipError;
  return newMembership;
};

const dataUrlToBlob = async dataUrl => (await fetch(dataUrl)).blob();

const uploadPhoto = async (dataUrl, centerId, userId, prefix) => {
  if (!dataUrl?.startsWith('data:')) return null;
  const blob = await dataUrlToBlob(dataUrl);
  const path = `${centerId}/${userId}/${prefix}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('anganwadi-photos').upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: false
  });
  if (error) throw error;
  return path;
};

const getPhotoUrl = async path => {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('anganwadi-photos').createSignedUrl(path, 60 * 60 * 24);
  if (error) return null;
  return data.signedUrl;
};

const defaultReport = { children: 30, present: 27, foodKg: 3.24, date: new Date().toISOString().slice(0, 10) };
const whatsappGroupLink = 'https://chat.whatsapp.com/KTtaNiviXQb3Dmytc2YMPD?s=cl&p=a&mlu=0&ilr=4';
const formatDate = date => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
const formatTime = date => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);

function App() {
  const [session, setSession] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setCheckingAuth(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCheckingAuth(false);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (checkingAuth) return <div className="login-page"><div className="login-panel"><div className="login-form-wrap"><h2>Loading...</h2></div></div></div>;
  return session ? <Dashboard user={session.user} onLogout={logout} /> : <AuthPage onLogin={() => {}} />;
}

function Dashboard({ user, onLogout }) {
  const [active, setActive] = useState('Overview');
  const [centerId, setCenterId] = useState(null);
  const [posts, setPosts] = useState([]);
  const [reports, setReports] = useState([]);
  const [students, setStudents] = useState([]);
  const [showCapture, setShowCapture] = useState(false);
  const [image, setImage] = useState(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedAt, setCapturedAt] = useState(null);
  const [photoId, setPhotoId] = useState('');
  const [snackName, setSnackName] = useState('');
  const [location, setLocation] = useState(null);
  const [note, setNote] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [toast, setToast] = useState('');
  const videoRef = useRef(null); const streamRef = useRef(null);

  const notify = message => { setToast(message); window.setTimeout(() => setToast(''), 3200); };

  const loadCloudData = async cid => {
    const [{ data: studentRows, error: studentError }, { data: reportRows, error: reportError }, { data: postRows, error: postError }] = await Promise.all([
      supabase.from('students').select('*').eq('center_id', cid).order('created_at', { ascending: false }),
      supabase.from('reports').select('*').eq('center_id', cid).order('report_date', { ascending: false }),
      supabase.from('food_posts').select('*').eq('center_id', cid).order('captured_at', { ascending: false })
    ]);
    if (studentError) throw studentError;
    if (reportError) throw reportError;
    if (postError) throw postError;

    const studentData = await Promise.all((studentRows || []).map(async row => ({
      id: row.id, name: row.name, age: row.age, cast: row.caste, religion: row.religion, mobile: row.mobile,
      photo: await getPhotoUrl(row.photo_path)
    })));
    const reportData = (reportRows || []).map(row => ({
      id: row.id, date: row.report_date, present: row.present_count, foodKg: Number(row.food_kg),
      locked: true, savedStudentCount: row.student_count
    }));
    const postData = await Promise.all((postRows || []).map(async row => ({
      id: row.id, food: row.snack_section, category: row.snack_section,
      description: row.note || `${row.snack_section} photo ready to share.`,
      items: ['Visible ingredients pending'], calories: 'Estimate unavailable', status: 'Unknown',
      user: user.user_metadata?.name || user.email?.split('@')[0] || 'Worker',
      time: `${formatDate(new Date(row.captured_at))}, ${formatTime(new Date(row.captured_at))}`,
      createdAt: row.created_at, image: await getPhotoUrl(row.photo_path),
      capturedAt: row.captured_at, location: null, note: row.note || ''
    })));
    setStudents(studentData);
    setReports(reportData);
    setPosts(postData);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const membership = await getOrCreateMembership(user);
        if (!mounted) return;
        setCenterId(membership.center_id);
        await loadCloudData(membership.center_id);
      } catch (error) {
        console.error(error);
        notify(`Cloud setup error: ${error.message || 'Please try again.'}`);
      }
    })();
    return () => { mounted = false; streamRef.current?.getTracks().forEach(track => track.stop()); };
  }, [user.id]);

  useEffect(() => { if (cameraOn && videoRef.current && streamRef.current) { videoRef.current.srcObject = streamRef.current; videoRef.current.play().catch(() => {}); } }, [cameraOn]);

  const requestLocation = () => { if (!navigator.geolocation) return notify('Location is not supported by this browser.'); navigator.geolocation.getCurrentPosition(position => setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, elevation: null }), () => notify('Location permission denied. Location details will show as unavailable.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }); };
  const openCamera = async section => { setSnackName(section || 'उपाहार'); setShowCapture(true); setImage(null); setCameraReady(false); requestLocation(); if (!navigator.mediaDevices?.getUserMedia) return notify('This browser does not support camera access. Use Gallery instead.'); try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); streamRef.current = stream; setCameraOn(true); } catch { notify('Camera permission denied or unavailable. Allow camera access, then try again.'); } };
  const capture = () => { const video = videoRef.current; if (!cameraReady || !video || video.readyState < 2 || !video.videoWidth) return notify('Camera is still starting. Please wait for the preview.'); const now = new Date(); const id = `FS-${Math.floor(1000 + Math.random() * 8999)}`; const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0); setImage(canvas.toDataURL('image/jpeg', .88)); setCapturedAt(now); setPhotoId(id); streamRef.current?.getTracks().forEach(track => track.stop()); setCameraOn(false); setCameraReady(false); };
  const onFile = event => { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) return notify('Please choose an image smaller than 8 MB.'); const reader = new FileReader(); reader.onload = () => { setImage(reader.result); setCapturedAt(new Date()); setPhotoId(`FS-${Math.floor(1000 + Math.random() * 8999)}`); setShowCapture(true); }; reader.readAsDataURL(file); };

  const saveFoodPost = async stampedImage => {
    if (!centerId) throw new Error('Center is still loading. Please try again.');
    const now = new Date();
    const id = photoId || `FS-${Math.floor(1000 + Math.random() * 8999)}`;
    const photoPath = await uploadPhoto(stampedImage, centerId, user.id, id);
    const { data, error } = await supabase.from('food_posts').insert({
      center_id: centerId, snack_section: snackName, photo_path: photoPath, note: note || null,
      captured_at: capturedAt?.toISOString() || now.toISOString(), created_by: user.id
    }).select('*').single();
    if (error) throw error;
    const signedImage = await getPhotoUrl(data.photo_path);
    return { id: data.id, food: data.snack_section, category: data.snack_section, description: data.note || `${data.snack_section} photo ready to share.`, items: ['Visible ingredients pending'], calories: 'Estimate unavailable', status: 'Unknown', user: user.user_metadata?.name || user.email?.split('@')[0] || 'Worker', time: `${formatDate(new Date(data.captured_at))}, ${formatTime(new Date(data.captured_at))}`, createdAt: data.created_at, image: signedImage || stampedImage, capturedAt: data.captured_at, location, note: data.note || '' };
  };

  const confirmShare = () => {
    setAnalyzing(true);
    window.setTimeout(async () => {
      try {
        const stampedImage = await makeStampedPhoto();
        const next = await saveFoodPost(stampedImage);
        setPosts(current => [next, ...current]); setAnalyzing(false); setShowCapture(false); setImage(null); setActive('Overview'); await shareToWhatsApp(next);
      } catch (error) { setAnalyzing(false); notify(`Could not save photo: ${error.message || 'Please try again.'}`); }
    }, 2100);
  };

  const makeStampedPhoto = async () => { if (!image) return image; const source = await new Promise((resolve, reject) => { const loaded = new Image(); loaded.onload = () => resolve(loaded); loaded.onerror = reject; loaded.src = image; }); const canvas = document.createElement('canvas'); canvas.width = source.naturalWidth; canvas.height = source.naturalHeight; const context = canvas.getContext('2d'); context.drawImage(source, 0, 0); const scale = Math.max(canvas.width / 900, 1); const lines = ['ANGANWADI SOFTWARE', snackName, `${capturedAt?.toLocaleDateString() || ''} ${capturedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, photoId, `Latitude: ${location ? location.latitude.toFixed(6) : 'Unavailable'}`, `Longitude: ${location ? location.longitude.toFixed(6) : 'Unavailable'}`, `Elevation: ${location?.elevation ?? 'Unavailable'}`, `Accuracy: ${location ? `${Math.round(location.accuracy)} m` : 'Unavailable'}`, `Note: ${note || 'No note'}`]; const padding = 18 * scale; const lineHeight = 22 * scale; const boxHeight = lines.length * lineHeight + padding * 2; context.fillStyle = 'rgba(25, 37, 31, 0.78)'; context.fillRect(0, canvas.height - boxHeight, canvas.width, boxHeight); context.fillStyle = '#ffffff'; context.font = `600 ${Math.max(14, 18 * scale)}px DM Sans, sans-serif`; lines.forEach((line, index) => context.fillText(line, padding, canvas.height - boxHeight + padding + (index + 1) * lineHeight - 5 * scale)); return canvas.toDataURL('image/jpeg', .92); };
  const directWhatsAppShare = async () => { try { const now = new Date(); window.open(whatsappGroupLink, '_blank', 'noopener,noreferrer'); const stampedImage = await makeStampedPhoto(); const next = await saveFoodPost(stampedImage); setPosts(current => [next, ...current]); if (stampedImage?.startsWith('data:')) { const link = document.createElement('a'); link.href = stampedImage; link.download = `${next.id}.jpg`; document.body.appendChild(link); link.click(); link.remove(); } setShowCapture(false); setImage(null); setCameraReady(false); } catch (error) { notify(`Could not save photo: ${error.message || 'Please try again.'}`); } };
  const shareToWhatsApp = async post => { const message = `🍽️ New Food Photo\n\nFood: ${post.food}\nShared by: ${post.user}\nDate: ${post.time}\nPhoto ID: ${post.id}\n\nAnganwadi Software`; try { if (post.image?.startsWith('data:') && navigator.share) { const response = await fetch(post.image); const blob = await response.blob(); const file = new File([blob], `${post.id}.jpg`, { type: blob.type || 'image/jpeg' }); if (!navigator.canShare || navigator.canShare({ files: [file] })) { await navigator.share({ title: 'Anganwadi Food Photo', text: message, files: [file] }); notify('Details सहित photo attached. Select WhatsApp group and tap Send.'); return; } } window.open(`${whatsappGroupLink}&text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer'); notify('Photo saved to cloud. WhatsApp group मध्ये attach करून Send करा.'); } catch { notify('Photo saved. WhatsApp sharing was cancelled.'); } };

  if (!centerId) return <div className="login-page"><div className="login-panel"><div className="login-form-wrap"><h2>Setting up center...</h2><p className="login-subtitle">Supabase cloud data loading...</p></div></div></div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><Utensils size={18} /></span><span>anganwadi<br /><b>software</b></span></div><p className="eyebrow">ANGANWADI CENTER</p><nav>{[['Overview', LayoutDashboard], ['Food History', History], ['विद्यार्थी नोंद', UserRound], ['अहवाल', ClipboardList]].map(([label, Icon]) => <button key={label} className={active === label ? 'nav-item active' : 'nav-item'} onClick={() => setActive(label)}><Icon size={18} /><span>{label}</span></button>)}</nav><div className="sidebar-bottom"><button className="nav-item"><Settings size={18} /><span>Settings</span></button><button className="nav-item logout-btn" onClick={onLogout}><LogOut size={18} /><span>Logout</span></button><div className="user-chip"><div className="avatar">{(user.user_metadata?.name || user.email || 'W')[0].toUpperCase()}</div><div><b>{user.user_metadata?.name || user.email}</b><span>Anganwadi worker</span></div><ChevronRight size={16} /></div></div></aside>
    <main className="main"><header className="topbar"><button className="mobile-menu"><Menu size={21} /></button><div><p className="date-label">Anganwadi Software · {new Date().toLocaleDateString()}</p><h1>{active === 'Overview' ? 'Good afternoon' : active}</h1></div><div className="top-actions"><button className="icon-btn notification"><Bell size={20} /><i /></button><button className="icon-btn top-logout" onClick={onLogout} title="Logout"><LogOut size={17} /></button><div className="avatar avatar-large">{(user.user_metadata?.name || user.email || 'W')[0].toUpperCase()}</div></div></header>
      {active === 'Overview' ? <Overview posts={posts} openCamera={openCamera} onFile={onFile} setActive={setActive} /> : active === 'Food History' ? <HistoryView posts={posts} /> : active === 'अहवाल' ? <ReportArchiveView reports={reports} setReports={setReports} studentCount={students.length} centerId={centerId} user={user} /> : <StudentsView students={students} setStudents={setStudents} centerId={centerId} user={user} />}
    </main>
    <nav className="mobile-nav">{[['Overview', LayoutDashboard], ['Food History', History], ['विद्यार्थी नोंद', UserRound], ['अहवाल', ClipboardList]].map(([label, Icon]) => <button className={active === label ? 'active' : ''} onClick={() => setActive(label)} key={label}><Icon size={19} /><span>{label === 'Food History' ? 'History' : label}</span></button>)}</nav>
    {showCapture && <CaptureModal snackName={snackName} image={image} capturedAt={capturedAt} photoId={photoId} location={location} note={note} setNote={setNote} requestLocation={requestLocation} cameraOn={cameraOn} videoRef={videoRef} cameraReady={cameraReady} onCameraReady={() => setCameraReady(true)} analyzing={analyzing} capture={capture} onFile={onFile} confirmShare={confirmShare} directWhatsAppShare={directWhatsAppShare} close={() => { streamRef.current?.getTracks().forEach(track => track.stop()); setShowCapture(false); setCameraOn(false); setCameraReady(false); }} retake={() => { setImage(null); openCamera(snackName); }} />}
    {toast && <div className="toast"><Check size={17} />{toast}</div>}
  </div>;
}

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if ((mode === 'register' && !name.trim()) || !cleanEmail || !password) return setError('कृपया सर्व माहिती भरा.');
    if (password.length < 6) return setError('पासवर्ड किमान ६ अक्षरांचा असावा.');
    setBusy(true); setError('');
    try {
      if (mode === 'register') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail, password,
          options: { data: { name: name.trim() } }
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setError('Account तयार झाले. Email confirmation पूर्ण करून Login करा.');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (signInError) throw signInError;
      }
      onLogin();
    } catch (err) { setError(err.message || 'Login/Register failed.'); }
    finally { setBusy(false); }
  };

  return <div className="login-page"><div className="login-art"><div className="login-brand"><span className="brand-mark"><Utensils size={18} /></span><span>anganwadi<br /><b>software</b></span></div><div className="login-message"><span className="pill"><Sparkles size={13} /> ANGANWADI CENTER</span><h1>मुलांच्या आरोग्याची<br /><em>दररोज काळजी.</em></h1><p>उपस्थिती, पोषण आणि केंद्रातील नोंदी एका सोप्या जागी व्यवस्थापित करा.</p></div><div className="login-shape"><div className="login-sun" /><span>care<br />daily</span></div></div><div className="login-panel"><div className="login-form-wrap"><div className="mobile-login-brand"><span className="brand-mark"><Utensils size={18} /></span><span>anganwadi<br /><b>software</b></span></div><span className="section-kicker">{mode === 'login' ? 'WELCOME BACK' : 'NEW ACCOUNT'}</span><h2>{mode === 'login' ? 'केंद्रात प्रवेश करा' : 'नवीन account तयार करा'}</h2><p className="login-subtitle">{mode === 'login' ? 'तुमच्या अंगणवाडी dashboard मध्ये प्रवेश करा.' : 'तुमच्या केंद्रासाठी cloud account तयार करा.'}</p><form onSubmit={submit}>{mode === 'register' && <label>पूर्ण नाव<div className="input-wrap"><UsersRound size={17} /><input value={name} onChange={event => setName(event.target.value)} placeholder="तुमचे नाव" /></div></label>}<label>ई-मेल पत्ता<div className="input-wrap"><Mail size={17} /><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="worker@example.com" /></div></label><label>पासवर्ड<div className="input-wrap"><LockKeyhole size={17} /><input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="किमान ६ अक्षरे" /></div></label>{error && <div className="login-error">{error}</div>}<button className="login-btn" type="submit" disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Login' : 'Register'} <ChevronRight size={17} /></button></form><button type="button" className="auth-toggle" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'नवीन account तयार करा' : 'आधीच account आहे? Login करा'}</button><p className="login-note">Cloud data Supabase मध्ये सुरक्षितपणे जतन केला जाईल.</p></div></div></div>;
}

function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const submit = event => { event.preventDefault(); if (!email.trim() || !password.trim() || (mode === 'register' && !name.trim())) { setError('कृपया सर्व माहिती भरा.'); return; } if (password.length < 6) { setError('पासवर्ड किमान ६ अक्षरांचा असावा.'); return; } const accounts = JSON.parse(localStorage.getItem('anganwadi-accounts') || '[]'); if (mode === 'register') { if (accounts.some(account => account.email === email.trim().toLowerCase())) { setError('या ई-मेलने account आधीच तयार आहे.'); return; } accounts.push({ name: name.trim(), email: email.trim().toLowerCase(), password }); localStorage.setItem('anganwadi-accounts', JSON.stringify(accounts)); onLogin(); return; } const account = accounts.find(item => item.email === email.trim().toLowerCase() && item.password === password); if (accounts.length && !account) { setError('ई-मेल किंवा पासवर्ड चुकीचा आहे.'); return; } onLogin(); };
  return <div className="login-page"><div className="login-art"><div className="login-brand"><span className="brand-mark"><Utensils size={18} /></span><span>anganwadi<br /><b>software</b></span></div><div className="login-message"><span className="pill"><Sparkles size={13} /> ANGANWADI CENTER</span><h1>मुलांच्या आरोग्याची<br /><em>दररोज काळजी.</em></h1><p>उपस्थिती, पोषण आणि केंद्रातील नोंदी एका सोप्या जागी व्यवस्थापित करा.</p><div className="login-stat"><b>10 AM</b><span>पौष्टिक उपाहाराची रोजची नोंद</span></div></div><div className="login-shape"><div className="login-sun" /><span>care<br />daily</span></div></div><div className="login-panel"><div className="login-form-wrap"><div className="mobile-login-brand"><span className="brand-mark"><Utensils size={18} /></span><span>anganwadi<br /><b>software</b></span></div><span className="section-kicker">WELCOME BACK</span><h2>केंद्रात प्रवेश करा</h2><p className="login-subtitle">तुमच्या अंगणवाडी dashboard मध्ये सुरक्षितपणे प्रवेश करा.</p><form onSubmit={submit}><label>ई-मेल पत्ता<div className="input-wrap"><Mail size={17} /><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="worker@example.com" /></div></label><label>पासवर्ड<div className="input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="तुमचा पासवर्ड" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Show password">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label><div className="login-options"><label className="remember"><input type="checkbox" defaultChecked /> मला लक्षात ठेवा</label><button type="button" className="forgot">पासवर्ड विसरलात?</button></div>{error && <div className="login-error">{error}</div>}<button className="login-btn" type="submit">Login <ChevronRight size={17} /></button></form><p className="login-note">Demo login साठी कोणताही valid email आणि password वापरा.</p></div></div></div>;
}

function Overview({ posts, openCamera, onFile, setActive }) { return <>
  <section className="welcome-grid"><div className="hero-stack"><div className="hero-card"><div className="hero-copy"><span className="pill"><Sparkles size={13} /> ANGANWADI NUTRITION</span><h2>लहान मुलांसाठी<br /><em>१० am चा उपाहार.</em></h2><p>मुलांच्या आरोग्यासाठी पौष्टिक आणि स्वादिष्ट उपाहाराची नोंद ठेवा.</p><button className="primary-btn" onClick={() => openCamera('१० AM चा उपाहार')}><Camera size={18} /> उपाहाराचा फोटो घ्या <ChevronRight size={17} /></button></div><div className="hero-doodle"><div className="sun"></div><span>पौष्टिक<br />आज</span></div></div><div className="hero-card second-hero"><div className="hero-copy"><span className="pill"><Sparkles size={13} /> ANGANWADI NUTRITION</span><h2>लहान मुलांसाठी<br /><em>११ am चा उपाहार.</em></h2><p>मुलांच्या आरोग्यासाठी पौष्टिक आणि स्वादिष्ट उपाहाराची नोंद ठेवा.</p><button className="primary-btn" onClick={() => openCamera('११ AM चा उपाहार')}><Camera size={18} /> उपाहाराचा फोटो घ्या <ChevronRight size={17} /></button></div><div className="hero-doodle"><div className="sun"></div><span>पौष्टिक<br />आज</span></div></div></div><div className="quick-card"><div className="quick-top"><span className="section-kicker">QUICK ACTIONS</span><Sparkles size={17} /></div><label className="upload-btn"><ImagePlus size={19} /><span>Choose from gallery</span><input type="file" accept="image/*" onChange={onFile} /></label><div className="mini-note"><span>+</span><p><b>१० आणि ११ am चे उपाहार</b><br /><small>मुलांसाठी पौष्टिक आहाराची नोंद.</small></p></div></div></section>
  <section className="section-head feed-head"><div><span className="section-kicker">MY FOOD GROUP</span><h2>Latest food moments</h2></div><button className="link-btn" onClick={() => setActive('Food History')}>See history <ChevronRight size={16} /></button></section>{posts.length ? <div className="feed-grid">{posts.slice(0, 3).map(post => <PostCard post={post} key={post.id} />)}</div> : <div className="feed-empty"><Camera size={23} /><h3>No food photos yet</h3><p>Take a photo to create your first WhatsApp share.</p></div>}
</>; }
function PostCard({ post }) { return <article className="post-card"><div className="post-image"><img src={post.image} alt={post.food} /><span className="category-tag">{post.category}</span><button className="save-btn"><FolderHeart size={17} /></button></div><div className="post-body"><div className="post-meta"><div className="avatar avatar-small">{post.user[0]}</div><span><b>{post.user}</b><small><Clock3 size={12} /> {post.time}</small></span><span className="photo-id">{post.id}</span></div><h3>{post.food}</h3><p>{post.description}</p><div className="ingredient-list">{post.items.slice(0, 3).map(item => <span key={item}>{item}</span>)}{post.items.length > 3 && <span>+{post.items.length - 3}</span>}</div><div className="nutrition"><span><Flame size={15} /> {post.calories}</span><span><Leaf size={15} /> {post.status}</span></div>{(post.location || post.note || post.capturedAt) && <div className="saved-metadata"><span>Photo: {post.id}</span><span>{post.location ? `${post.location.latitude.toFixed(4)}, ${post.location.longitude.toFixed(4)}` : 'Location unavailable'}</span>{post.note && <span>Note: {post.note}</span>}</div>}</div></article>; }
function StudentsView({ students, setStudents, centerId, user }) {
  const emptyStudent = { name: '', age: '', cast: '', religion: '', mobile: '', photo: '' };
  const [student, setStudent] = useState(emptyStudent); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const update = (field, value) => setStudent(current => ({ ...current, [field]: value }));
  const onPhoto = event => { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) return setError('Passport photo 2 MB पेक्षा कमी असावा.'); const reader = new FileReader(); reader.onload = () => { setStudent(current => ({ ...current, photo: reader.result })); setError(''); }; reader.readAsDataURL(file); };
  const addStudent = async event => {
    event.preventDefault();
    if (!student.name.trim() || !student.age || !student.cast.trim() || !student.religion.trim() || !student.mobile.trim() || !student.photo) return setError('कृपया सर्व माहिती आणि passport photo भरा.');
    if (!/^\d{10}$/.test(student.mobile.trim())) return setError('मोबाइल नंबर 10 अंकी असावा.');
    setSaving(true); setError('');
    try {
      const photoPath = await uploadPhoto(student.photo, centerId, user.id, `student-${Date.now()}`);
      const { data, error: insertError } = await supabase.from('students').insert({
        center_id: centerId, name: student.name.trim(), age: Number(student.age), caste: student.cast.trim(),
        religion: student.religion.trim(), mobile: student.mobile.trim(), photo_path: photoPath
      }).select('*').single();
      if (insertError) throw insertError;
      const photoUrl = await getPhotoUrl(photoPath);
      setStudents(current => [{ id: data.id, name: data.name, age: data.age, cast: data.caste, religion: data.religion, mobile: data.mobile, photo: photoUrl }, ...current]);
      setStudent(emptyStudent);
    } catch (err) { setError(err.message || 'विद्यार्थी save करता आला नाही.'); }
    finally { setSaving(false); }
  };
  return <div className="page-content student-page"><section className="page-intro"><div><span className="section-kicker">ANGANWADI CENTER</span><h2>विद्यार्थी नोंद</h2><p>प्रत्येक मुलाची वैयक्तिक माहिती आणि passport photo cloud मध्ये जतन करा.</p></div><div className="protected-badge"><ShieldCheck size={17} /><span>Parent delete बंद</span></div></section><form className="student-form" onSubmit={addStudent}><div className="student-fields"><label>मुलाचे पूर्ण नाव<input value={student.name} onChange={event => update('name', event.target.value)} placeholder="उदा. आरव शिंदे" /></label><label>वय<input type="number" min="1" max="10" value={student.age} onChange={event => update('age', event.target.value)} placeholder="वय" /></label><label>जात<input value={student.cast} onChange={event => update('cast', event.target.value)} placeholder="जात" /></label><label>धर्म<input value={student.religion} onChange={event => update('religion', event.target.value)} placeholder="धर्म" /></label><label>मोबाइल नंबर<input inputMode="numeric" maxLength="10" value={student.mobile} onChange={event => update('mobile', event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10 अंकी मोबाइल नंबर" /></label><label className="student-photo-input">Passport photo<input type="file" accept="image/*" onChange={onPhoto} /><span>{student.photo ? 'Photo selected' : 'Photo निवडा'}</span></label></div>{error && <p className="student-error">{error}</p>}<button className="primary-btn" type="submit" disabled={saving}><Plus size={17} /> {saving ? 'Saving...' : 'विद्यार्थी add करा'}</button></form><section className="student-list"><div className="section-head"><div><span className="section-kicker">REGISTERED STUDENTS</span><h2>{students.length} विद्यार्थी</h2></div><span className="student-lock"><ShieldCheck size={15} /> Delete unavailable</span></div>{students.length ? <div className="student-grid">{students.map(item => <article className="student-card" key={item.id}>{item.photo ? <img src={item.photo} alt={`${item.name} passport photo`} /> : <div className="student-avatar"><UserRound size={22} /></div>}<div><h3>{item.name}</h3><p>वय {item.age} · {item.cast} · {item.religion}</p><small>मोबाइल: {item.mobile}</small></div></article>)}</div> : <div className="student-empty"><UserRound size={25} /><h3>अजून विद्यार्थी नोंदलेले नाहीत</h3><p>वरच्या form मधून पहिला विद्यार्थी add करा.</p></div>}</section></div>;
}

function ReportView({ report, setReport, studentCount }) { const locked = Boolean(report.locked); const totalStudents = locked ? report.savedStudentCount : studentCount; const present = Math.min(report.present, totalStudents); const attendance = totalStudents ? Math.round((present / totalStudents) * 100) : 0; const foodPerChild = totalStudents ? (report.foodKg / totalStudents).toFixed(3) : '0.000'; const update = (field, value) => { if (!locked) setReport(current => ({ ...current, [field]: field === 'date' ? value : Math.max(0, Number(value)) })); }; const saveReport = () => { if (!locked) setReport(current => ({ ...current, locked: true, savedStudentCount: totalStudents, present })); }; return <div className="page-content report-page"><section className="page-intro"><div><span className="section-kicker">ANGANWADI CENTER</span><h2>अहवाल</h2><p>मुलांची संख्या, रोजची उपस्थिती आणि शासनाकडून मिळालेल्या खाऊचा दैनिक हिशोब.</p></div><div className="protected-badge"><ShieldCheck size={17} /><span>{locked ? 'Report locked' : 'Protected data'}</span></div></section><section className={`report-form ${locked ? 'report-locked' : ''}`}><div><label>अहवालाची तारीख<input type="date" disabled={locked} value={report.date} onChange={event => update('date', event.target.value)} /></label><label>एकूण विद्यार्थी<output className="report-fixed-value">{totalStudents}</output></label><label>आज उपस्थित मुले<input type="number" min="0" max={totalStudents} disabled={locked} value={present} onChange={event => update('present', Math.min(totalStudents, event.target.value))} /></label><label>सरकारकडून आलेला खाऊ (किलो)<input type="number" min="0" step="0.01" disabled={locked} value={report.foodKg} onChange={event => update('foodKg', event.target.value)} /></label></div><p className="report-source"><ShieldCheck size={14} /> {locked ? 'हा अहवाल एकदा जतन केल्यानंतर बदलता येणार नाही.' : 'एकूण विद्यार्थी संख्या विद्यार्थी नोंद मधील records वरून आपोआप येते.'}</p><button className="primary-btn report-save" disabled={locked} onClick={saveReport}><Check size={17} /> {locked ? 'अहवाल जतन झाला' : 'अहवाल जतन करा'}</button></section><div className="report-cards"><article><UsersRound size={21} /><span>एकूण मुले</span><strong>{totalStudents}</strong><small>नोंदणीकृत विद्यार्थी</small></article><article><ClipboardList size={21} /><span>आजची उपस्थिती</span><strong>{present} <em>/ {totalStudents}</em></strong><small>{attendance}% उपस्थित</small></article><article><Utensils size={21} /><span>प्रति मुलगा खाऊ</span><strong>{foodPerChild} <em>kg</em></strong><small>{report.foodKg} kg एकूण उपलब्ध</small></article></div><div className="report-notice"><ShieldCheck size={21} /><div><b>पालकांसाठी माहिती सुरक्षित आहे</b><p>हा अहवाल पाहता येतो, पण parent user कडून delete करता येत नाही. जतन केलेली माहिती browser मध्ये कायम ठेवली जाते.</p></div></div></div>; }
function HistoryView({ posts }) { const [query, setQuery] = useState(''); const [filter, setFilter] = useState('All time'); const filtered = posts.filter(post => post.food.toLowerCase().includes(query.toLowerCase()) && (filter === 'All time' || (filter === 'Today' && post.time.startsWith('Today')))); return <div className="page-content"><section className="page-intro"><div><span className="section-kicker">YOUR ARCHIVE</span><h2>Food history</h2><p>A visual record of everything you have shared.</p></div><div className="history-stat"><b>{posts.length}</b><span>moments saved</span></div></section><div className="history-tools"><div className="search-box"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search food..." /></div><div className="filter-tabs">{['All time', 'Today', 'This week', 'This month'].map(item => <button className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div></div><div className="feed-grid">{filtered.map(post => <PostCard post={post} key={post.id} />)}</div>{!filtered.length && <div className="empty"><Search size={28} /><h3>No food moments found</h3><p>Try a different search or time filter.</p></div>}</div>; }
function CaptureModal({ snackName, image, capturedAt, photoId, location, note, setNote, requestLocation, cameraOn, videoRef, cameraReady, onCameraReady, analyzing, capture, onFile, confirmShare, directWhatsAppShare, close, retake }) { return <div className="modal-backdrop"><div className="capture-modal">{analyzing ? <div className="analysis-screen"><div className="analysis-orbit"><Sparkles size={28} /></div><span className="section-kicker">SMART ANALYSIS</span><h2>Analyzing your food...</h2><p>Reading only what is visible, then preparing your share.</p><div className="progress-list">{['Detecting food', 'Identifying dish', 'Generating description', 'Preparing photo details', 'Sharing to group'].map((step, i) => <div className={i < 4 ? 'done' : ''} key={step}><span>{i < 4 ? <Check size={13} /> : <i />}</span>{step}{i < 4 && <small>Done</small>}</div>)}</div></div> : <><div className="modal-head"><div><span className="section-kicker">NEW MOMENT</span><h2>{snackName}</h2></div><button className="icon-btn" onClick={close}><X size={19} /></button></div><div className="camera-frame">{image ? <><img src={image} alt="Food preview" /><div className="photo-stamp"><b>ANGANWADI SOFTWARE</b><span>{snackName}</span><span>{capturedAt ? `${capturedAt.toLocaleDateString()} · ${capturedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span><span>{photoId}</span><span>Lat: {location ? location.latitude.toFixed(6) : 'Unavailable'}</span><span>Long: {location ? location.longitude.toFixed(6) : 'Unavailable'}</span><span>Elev: {location?.elevation ?? 'Unavailable'}</span><span>Acc: {location ? `${Math.round(location.accuracy)} m` : 'Unavailable'}</span>{note && <span>Note: {note}</span>}</div></> : cameraOn ? <video ref={videoRef} onCanPlay={onCameraReady} autoPlay playsInline /> : <div className="camera-empty"><Camera size={32} /><p>Camera preview will appear here</p><small>Good light makes better details.</small></div>}<span className="frame-corner top-left" /><span className="frame-corner bottom-right" /></div>{image && <div className="photo-details"><div><span>Photo ID</span><b>{photoId}</b></div><div><span>Snack section</span><b>{snackName}</b></div><div><span>Date & time</span><b>{capturedAt?.toLocaleString() || 'Just now'}</b></div><div><span>Latitude / Longitude</span><b>{location ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : 'Unavailable'}</b></div><div><span>Elevation / Accuracy</span><b>{location ? `Unavailable / ${Math.round(location.accuracy)} m` : 'Unavailable'}</b></div><div><span>Shared by</span><b>Aniket</b></div><label className="note-field"><span>Note</span><input value={note} onChange={event => setNote(event.target.value)} placeholder="उदा. मुलांनी उपाहार घेतला" /></label><button className="location-btn" onClick={requestLocation}><span>Update location</span></button></div>}{image ? <div className="capture-actions preview-actions"><button className="secondary-btn" onClick={retake}>Retake</button><button className="whatsapp-btn" onClick={directWhatsAppShare}><MessageCircle size={17} /> Direct WhatsApp Group</button><button className="primary-btn" onClick={confirmShare}><Sparkles size={17} /> Analyze & share</button></div> : <div className="capture-actions"><label className="secondary-btn upload-inline"><ImagePlus size={17} /> Gallery<input type="file" accept="image/*" onChange={onFile} /></label><button className="capture-btn" disabled={!cameraReady} onClick={capture}><Camera size={22} /></button><span className="capture-hint">{cameraReady ? 'Tap to capture' : 'Starting camera...'}</span></div>}</>}</div></div>; }
function ReportArchiveView({ reports, setReports, studentCount, centerId, user }) {
  const today = new Date().toISOString().slice(0, 10); const dates = [...new Set([today, ...reports.map(item => item.date)])].sort((a, b) => b.localeCompare(a));
  const [selectedDate, setSelectedDate] = useState(dates[0] || today); const saved = reports.find(item => item.date === selectedDate);
  const [draft, setDraft] = useState(() => saved || { date: selectedDate, present: 0, foodKg: 0 }); const [saving, setSaving] = useState(false);
  useEffect(() => { const next = reports.find(item => item.date === selectedDate); setDraft(next || { date: selectedDate, present: 0, foodKg: 0 }); }, [selectedDate, reports]);
  const locked = Boolean(saved); const totalStudents = locked ? saved.savedStudentCount : studentCount; const present = Math.min(Number(draft.present) || 0, totalStudents);
  const attendance = totalStudents ? Math.round((present / totalStudents) * 100) : 0; const foodPerChild = totalStudents ? (Number(draft.foodKg) / totalStudents).toFixed(3) : '0.000';
  const update = (field, value) => { if (!locked) setDraft(current => ({ ...current, [field]: field === 'foodKg' ? Math.max(0, Number(value)) : Math.min(totalStudents, Math.max(0, Number(value))) })); };
  const saveReport = async () => {
    if (locked || reports.some(item => item.date === selectedDate)) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('reports').insert({ center_id: centerId, report_date: selectedDate, student_count: totalStudents, present_count: present, food_kg: Number(draft.foodKg) || 0, created_by: user.id }).select('*').single();
      if (error) throw error;
      const { error: attendanceError } = await supabase.from('attendance').insert({ center_id: centerId, attendance_date: selectedDate, present_count: present });
      if (attendanceError && !attendanceError.message?.toLowerCase().includes('duplicate')) throw attendanceError;
      setReports(current => [...current, { id: data.id, date: data.report_date, present: data.present_count, foodKg: Number(data.food_kg), locked: true, savedStudentCount: data.student_count }].sort((a, b) => b.date.localeCompare(a.date)));
    } catch (err) { alert(err.message || 'Report save failed.'); }
    finally { setSaving(false); }
  };
  return <div className="page-content report-page"><section className="page-intro"><div><span className="section-kicker">ANGANWADI CENTER</span><h2>अहवाल</h2><p>आजचा किंवा मागील तारखेचा अहवाल निवडून पाहता येतो.</p></div><div className="protected-badge"><ShieldCheck size={17} /><span>{locked ? 'Report locked' : 'नवीन अहवाल'}</span></div></section><section className={`report-form ${locked ? 'report-locked' : ''}`}><div className="report-date-picker"><label>अहवालाची तारीख<select value={selectedDate} onChange={event => setSelectedDate(event.target.value)}>{dates.map(date => <option value={date} key={date}>{date === today ? `आज - ${date}` : date}</option>)}</select></label><label>एकूण विद्यार्थी<output className="report-fixed-value">{totalStudents}</output></label><label>आज उपस्थित मुले<input type="number" min="0" max={totalStudents} disabled={locked} value={present} onChange={event => update('present', event.target.value)} /></label><label>सरकारकडून आलेला खाऊ (किलो)<input type="number" min="0" step="0.01" disabled={locked} value={draft.foodKg} onChange={event => update('foodKg', event.target.value)} /></label></div><p className="report-source"><ShieldCheck size={14} /> {locked ? 'हा जुना अहवाल फक्त पाहण्यासाठी आहे; बदलता येणार नाही.' : 'आजचा अहवाल Supabase cloud मध्ये जतन होईल.'}</p><button className="primary-btn report-save" disabled={locked || saving} onClick={saveReport}><Check size={17} /> {locked ? 'फक्त पाहता येईल' : saving ? 'Saving...' : 'अहवाल जतन करा'}</button></section><div className="report-cards"><article><UsersRound size={21} /><span>एकूण मुले</span><strong>{totalStudents}</strong><small>त्या तारखेचा विद्यार्थी snapshot</small></article><article><ClipboardList size={21} /><span>उपस्थिती</span><strong>{present} <em>/ {totalStudents}</em></strong><small>{attendance}% उपस्थित</small></article><article><Utensils size={21} /><span>प्रति मुलगा खाऊ</span><strong>{foodPerChild} <em>kg</em></strong><small>{draft.foodKg} kg एकूण उपलब्ध</small></article></div><div className="report-notice"><ShieldCheck size={21} /><div><b>अहवाल सुरक्षित cloud archive मध्ये आहे</b><p>जतन केलेला report edit, overwrite किंवा delete करता येणार नाही.</p></div></div></div>;
}
