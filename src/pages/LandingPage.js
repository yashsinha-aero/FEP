import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import fepLogo from '../assets/fep-logo.png';
import cambridgeLogo from '../assets/cambridge.png';
import imperialLogo from '../assets/imperial.jpg';
import stanfordLogo from '../assets/stanford.png';
import sydneyLogo from '../assets/university-of-sydney.svg';
import yaleLogo from '../assets/yale-university.png';
import '../styles/landing.css';
import Footer from '../components/Footer';

const LandingPage = () => {
    const canvasRef = useRef(null);
    const [scrolled, setScrolled] = useState(false);
    const [openFaq, setOpenFaq] = useState(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        if (window.location.hash) {
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, []);

    const scrollToSection = (e, id) => {
        e.preventDefault();
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        setMobileMenuOpen(false);
    };

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        const observerOptions = { root: null, rootMargin: '0px', threshold: 0.15 };
        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    obs.unobserve(entry.target);
                }
            });
        }, observerOptions);

        document.querySelectorAll('.fade-in-section').forEach((section) => {
            observer.observe(section);
        });
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animationFrameId;
        
        let width, height;
        function resizeCanvas() {
            width = canvas.width = canvas.offsetWidth;
            height = canvas.height = canvas.offsetHeight;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        const polygons = [
            [{x:-0.05,y:0.1}, {x:0.1,y:0.3}, {x:0.15,y:0.55}, {x:0.02,y:0.7}, {x:-0.1,y:0.6}],
            [{x:0.25,y:0.1}, {x:0.35,y:0.05}, {x:0.45,y:0.15}, {x:0.42,y:0.3}, {x:0.28,y:0.25}],
            [{x:0.5,y:0.2}, {x:0.65,y:0.1}, {x:0.75,y:0.2}, {x:0.68,y:0.35}, {x:0.55,y:0.32}],
            [{x:0.75,y:0.05}, {x:0.95,y:0.1}, {x:0.98,y:0.35}, {x:0.85,y:0.4}, {x:0.78,y:0.25}],
            [{x:0.3,y:0.45}, {x:0.45,y:0.5}, {x:0.55,y:0.65}, {x:0.48,y:0.8}, {x:0.32,y:0.75}],
            [{x:0.6,y:0.42}, {x:0.75,y:0.4}, {x:0.85,y:0.55}, {x:0.8,y:0.8}, {x:0.65,y:0.75}],
            [{x:0.88,y:0.5}, {x:1.05,y:0.52}, {x:1.02,y:0.8}, {x:0.9,y:0.85}]
        ];

        const nodes = [
            {x: 0.32, y: 0.28, type: 'connected'}, 
            {x: 0.68, y: 0.29, type: 'connected'}, 
            {x: 0.43, y: 0.55, type: 'connected'}, 
            {x: 0.82, y: 0.58, type: 'connected'}, 
            {x: 0.15, y: 0.40, type: 'connected'}, 
            {x: 0.55, y: 0.75, type: 'connected'}, 
            {x: 0.88, y: 0.30, type: 'connected'}, 
            {x: 0.25, y: 0.70, type: 'connected'}, 
            {x: 0.52, y: 0.15, type: 'connected'}, 
            {x: 0.05, y: 0.29, type: 'scatter'},
            {x: 0.08, y: 0.70, type: 'scatter'},
            {x: 0.90, y: 0.80, type: 'scatter'},
            {x: 0.70, y: 0.95, type: 'scatter'}
        ];

        const edges = [
            {from: 0, to: 1, curve: -0.15}, {from: 0, to: 2, curve: 0.1},  
            {from: 1, to: 3, curve: 0.15}, {from: 1, to: 2, curve: -0.1}, 
            {from: 2, to: 3, curve: 0.2}, {from: 4, to: 0, curve: -0.2},
            {from: 4, to: 2, curve: 0.15}, {from: 7, to: 4, curve: -0.1},
            {from: 7, to: 2, curve: -0.15}, {from: 2, to: 5, curve: 0.1},
            {from: 5, to: 3, curve: -0.15}, {from: 1, to: 6, curve: -0.1},
            {from: 3, to: 6, curve: 0.15}, {from: 8, to: 0, curve: -0.1},
            {from: 8, to: 1, curve: 0.1}
        ];

        edges.forEach(edge => {
            const p0 = nodes[edge.from];
            const p1 = nodes[edge.to];
            const midX = (p0.x + p1.x) / 2;
            const midY = (p0.y + p1.y) / 2;
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            edge.cp = { x: midX - dy * edge.curve, y: midY + dx * edge.curve };
        });

        const isMobile = window.innerWidth < 768;
        const particleCount = isMobile ? 15 : 40;

        const particles = Array.from({ length: particleCount }, () => ({
            edge: Math.floor(Math.random() * edges.length),
            t: Math.random(), 
            speed: 0.0008 + Math.random() * 0.001, 
            reverse: Math.random() > 0.5
        }));

        let animationTime = 0;

        function drawNetwork() {
            ctx.clearRect(0, 0, width, height);
            animationTime += 0.2; 
            
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            polygons.forEach(poly => {
                ctx.beginPath();
                ctx.moveTo(poly[0].x * width, poly[0].y * height);
                for(let i = 1; i < poly.length; i++) {
                    ctx.lineTo(poly[i].x * width, poly[i].y * height);
                }
                ctx.closePath();
                ctx.stroke();
            });

            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 6]);
            ctx.lineDashOffset = -animationTime; 
            
            edges.forEach(edge => {
                const p0 = nodes[edge.from];
                const p1 = nodes[edge.to];
                ctx.moveTo(p0.x * width, p0.y * height);
                ctx.quadraticCurveTo(edge.cp.x * width, edge.cp.y * height, p1.x * width, p1.y * height);
            });
            ctx.stroke();
            ctx.setLineDash([]); 

            particles.forEach(p => {
                p.t += p.speed;
                if(p.t >= 1) {
                    p.edge = Math.floor(Math.random() * edges.length);
                    p.t = 0;
                    p.speed = 0.0008 + Math.random() * 0.001;
                    p.reverse = Math.random() > 0.5;
                }
                const edge = edges[p.edge];
                const p0 = p.reverse ? nodes[edge.to] : nodes[edge.from];
                const p1 = p.reverse ? nodes[edge.from] : nodes[edge.to];
                const cp = edge.cp;
                const mt = 1 - p.t;
                const x = mt*mt*p0.x + 2*mt*p.t*cp.x + p.t*p.t*p1.x;
                const y = mt*mt*p0.y + 2*mt*p.t*cp.y + p.t*p.t*p1.y;
                
                ctx.beginPath();
                ctx.arc(x * width, y * height, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#ffffff';
                ctx.fill();
                ctx.shadowBlur = 0;
            });

            nodes.forEach(node => {
                const nx = node.x * width;
                const ny = node.y * height;
                const isConnected = node.type === 'connected';
                
                ctx.beginPath();
                ctx.arc(nx, ny, isConnected ? 5 : 3.5, 0, Math.PI * 2);
                ctx.fillStyle = '#ff3b3b'; 
                ctx.shadowBlur = isConnected ? 25 : 15;
                ctx.shadowColor = '#ff0000';
                ctx.fill();
                
                if(isConnected) {
                    ctx.beginPath();
                    ctx.arc(nx, ny, 2, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowBlur = 0; 
                    ctx.fill();
                }
                ctx.shadowBlur = 0; 
            });

            animationFrameId = requestAnimationFrame(drawNetwork);
        }
        drawNetwork();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    const faqs = [
        {
            q: "How does FEP differ from applying directly?",
            a: "FEP streamlines the process by providing a centralized portal with curated opportunities from our partner institutions, dedicated support, and often specialized funding or credit transfer agreements not available to independent applicants."
        },
        {
            q: "Does CGPA affect my selection?",
            a: "While CGPA is considered by some host institutions, we look at your overall profile including past research experience, statement of purpose, and relevant coursework. Strong alignment with the project is often more important than GPA alone."
        },
        {
            q: "Can I back out after being selected?",
            a: "Backing out after accepting an offer is strongly discouraged as it damages the institution's relationship with partners. Specific penalties and policies are outlined in the student agreement you sign upon selection."
        }
    ];

    const partnerLogos = [
        { src: cambridgeLogo, alt: 'University of Cambridge' },
        { src: imperialLogo, alt: 'Imperial College London' },
        { src: stanfordLogo, alt: 'Stanford University' },
        { src: sydneyLogo, alt: 'University of Sydney' },
        { src: yaleLogo, alt: 'Yale University' }
    ];

    return (
        <div className="landing-body font-sans antialiased selection:bg-cyan-500 selection:text-white">
            <style>
                {`
                .ticker-wrap {
                    overflow: hidden;
                    white-space: nowrap;
                    mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
                    -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
                    width: 100%;
                    display: flex;
                }
                .ticker-move {
                    display: flex;
                    flex-wrap: nowrap;
                    min-width: max-content;
                    animation: ticker 30s linear infinite;
                }
                .ticker-move:hover {
                    animation-play-state: paused;
                }
                @keyframes ticker {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                `}
            </style>
            
            {/* Global Background Elements */}
            <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
                <div className="absolute top-[30%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-blue-600/10 blur-[120px]"></div>
                <div className="absolute bottom-[10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-purple-600/10 blur-[150px]"></div>
            </div>

            <nav className={`border-b border-white/10 px-6 py-4 sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'shadow-[0_4px_30px_rgba(0,0,0,0.5)] bg-[#0f172a]/90 backdrop-blur-md' : 'bg-transparent hero-bg'}`}>
                <div className="flex justify-between items-center max-w-7xl mx-auto w-full relative">
                    <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                        <img src={fepLogo} alt="FEP Logo" className="h-10 bg-white rounded-xl p-1.5 object-contain transition-transform hover:scale-105" />
                        <div className="text-sm font-bold leading-tight text-white/90">
                            Foreign Exposure<br />Programme
                        </div>
                    </div>
                    
                    <div className="hidden md:flex gap-8 text-sm font-medium text-slate-300">
                        <a href="#about" onClick={(e) => scrollToSection(e, 'about')} className="hover:text-cyan-400 transition-colors duration-200">About</a>
                        <a href="#faq" onClick={(e) => scrollToSection(e, 'faq')} className="hover:text-cyan-400 transition-colors duration-200">F.A.Q</a>
                        <a href="#contact" onClick={(e) => scrollToSection(e, 'contact')} className="hover:text-cyan-400 transition-colors duration-200">Contact</a>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <Link to="/login" className="bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-sm text-white px-5 py-2 rounded-md text-sm font-bold transition-all duration-200 shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] transform hover:-translate-y-0.5 inline-block">Sign in</Link>
                        
                        <button 
                            className="md:hidden text-slate-300 hover:text-white transition-colors"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            aria-label="Toggle menu"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}></path>
                            </svg>
                        </button>
                    </div>
                </div>

                <div className={`md:hidden absolute top-full left-0 w-full bg-[#0f172a]/95 backdrop-blur-xl border-b border-white/10 transition-all duration-300 overflow-hidden shadow-2xl ${mobileMenuOpen ? 'max-h-48 py-4 opacity-100' : 'max-h-0 py-0 opacity-0'}`}>
                    <div className="flex flex-col items-center gap-4 text-base font-medium text-slate-300">
                        <a href="#about" onClick={(e) => scrollToSection(e, 'about')} className="hover:text-cyan-400 w-full text-center py-2">About</a>
                        <a href="#faq" onClick={(e) => scrollToSection(e, 'faq')} className="hover:text-cyan-400 w-full text-center py-2">F.A.Q</a>
                        <a href="#contact" onClick={(e) => scrollToSection(e, 'contact')} className="hover:text-cyan-400 w-full text-center py-2">Contact</a>
                    </div>
                </div>
            </nav>

            <header className="hero-bg relative overflow-hidden px-6 py-24 md:py-32 min-h-[600px] flex items-center">
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-0 opacity-90"></canvas>
                <div className="max-w-4xl mx-auto relative z-10 fade-in-section is-visible w-full text-center md:text-left pointer-events-none">
                    <p className="text-cyan-400 text-sm tracking-[0.2em] font-extrabold mb-4 uppercase text-shadow-lg">Academics and Career Council</p>
                    <h1 className="text-5xl md:text-7xl font-extrabold mb-6 text-white leading-tight tracking-tight text-glow-high">
                        Foreign Exposure<br />Programme
                    </h1>
                    <p className="text-lg md:text-xl text-slate-100 mb-10 max-w-2xl leading-relaxed font-semibold text-shadow-md md:mx-0 mx-auto">
                        Step onto the world stage. Connect with premier partner universities, secure fully-funded internships, and elevate your research career — all from one unified portal.
                    </p>
                    <Link to="/signup" className="pointer-events-auto relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-300 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:from-cyan-400 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 shadow-[0_10px_25px_rgba(56,189,248,0.4)] hover:shadow-[0_15px_35px_rgba(56,189,248,0.6)] transform hover:-translate-y-1">
                        Start Your Journey
                    </Link>
                </div>
            </header>

            <section className="bg-[#0f172a] py-12 neon-border-bottom relative z-20">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-900/10 via-purple-900/10 to-teal-900/10 mix-blend-screen pointer-events-none"></div>
                <div className="max-w-6xl mx-auto px-6 text-center relative z-10 overflow-hidden">
                    <p className="text-indigo-300/80 text-xs uppercase tracking-[0.2em] mb-8 font-bold">Collaborating with global leaders</p>
                    <div className="ticker-wrap relative w-full">
                        <div className="ticker-move flex flex-nowrap w-max items-center gap-12 px-6">
                            {[...partnerLogos, ...partnerLogos, ...partnerLogos].map((logo, idx) => (
                                <div key={idx} className="flex-shrink-0 w-56 h-24 bg-white rounded-2xl flex items-center justify-center p-4 shadow-[0_4px_20px_rgba(0,0,0,0.3)] border border-white/20 hover:scale-105 transition-transform duration-300">
                                    <img src={logo.src} alt={logo.alt} className="max-w-full max-h-full object-contain" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section id="about" className="py-28 px-6 max-w-7xl mx-auto fade-in-section relative z-20">
                <div className="text-center mb-20 relative">
                    <div className="absolute left-1/2 -top-10 -translate-x-1/2 w-40 h-40 bg-cyan-500/20 blur-[60px] rounded-full pointer-events-none"></div>
                    <h2 className="text-4xl md:text-6xl font-extrabold mb-4 text-white text-shadow-lg">Why FEP</h2>
                    <p className="text-cyan-200 text-lg font-medium">Built for IIT Kanpur students pursuing global research opportunities</p>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <div className="vibrant-card p-8 rounded-2xl group border-t-4 border-cyan-400 shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:shadow-[0_15px_40px_rgba(34,211,238,0.25)] hover:-translate-y-2">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl group-hover:bg-cyan-500/20 transition-all"></div>
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_20px_rgba(34,211,238,0.5)]">
                            <span className="text-white text-3xl">🌐</span>
                        </div>
                        <h3 className="font-extrabold text-2xl mb-3 text-white group-hover:text-cyan-300 transition-colors">Global exposure</h3>
                        <p className="text-sm text-slate-300 leading-relaxed font-medium">Collaborate with prestigious international labs and faculty on cutting-edge research.</p>
                    </div>
                    <div className="vibrant-card p-8 rounded-2xl group border-t-4 border-purple-400 shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:shadow-[0_15px_40px_rgba(192,132,252,0.25)] hover:-translate-y-2 delay-75">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-all"></div>
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-400 to-pink-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_20px_rgba(192,132,252,0.5)]">
                            <span className="text-white text-3xl">💼</span>
                        </div>
                        <h3 className="font-extrabold text-2xl mb-3 text-white group-hover:text-purple-300 transition-colors">Career prospects</h3>
                        <p className="text-sm text-slate-300 leading-relaxed font-medium">Build a profile that strongly stands out for future industry roles and grad school.</p>
                    </div>
                    <div className="vibrant-card p-8 rounded-2xl group border-t-4 border-emerald-400 shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:shadow-[0_15px_40px_rgba(52,211,153,0.25)] hover:-translate-y-2 delay-150">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all"></div>
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_20px_rgba(52,211,153,0.5)]">
                            <span className="text-white text-3xl">👥</span>
                        </div>
                        <h3 className="font-extrabold text-2xl mb-3 text-white group-hover:text-emerald-300 transition-colors">Networking</h3>
                        <p className="text-sm text-slate-300 leading-relaxed font-medium">Connect globally with leading researchers, professors, and successful FEP alumni.</p>
                    </div>
                    <div className="vibrant-card p-8 rounded-2xl group border-t-4 border-orange-400 shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:shadow-[0_15px_40px_rgba(251,146,60,0.25)] hover:-translate-y-2 delay-200">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl group-hover:bg-orange-500/20 transition-all"></div>
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-orange-400 to-red-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_20px_rgba(251,146,60,0.5)]">
                            <span className="text-white text-3xl">⚡</span>
                        </div>
                        <h3 className="font-extrabold text-2xl mb-3 text-white group-hover:text-orange-300 transition-colors">Skill building</h3>
                        <p className="text-sm text-slate-300 leading-relaxed font-medium">Gain hands-on access to the latest technological tools and innovative methodologies.</p>
                    </div>
                </div>
            </section>

            <section id="faq" className="py-24 px-6 max-w-4xl mx-auto fade-in-section relative z-20">
                <h2 className="text-4xl md:text-5xl font-extrabold text-center mb-16 text-white text-shadow-lg">Frequently asked questions</h2>
                <div className="space-y-6">
                    {faqs.map((faq, idx) => (
                        <div key={idx} className="faq-item vibrant-card rounded-2xl border border-slate-700 overflow-hidden transition-all duration-300 hover:border-cyan-500/50 hover:shadow-[0_5px_20px_rgba(56,189,248,0.15)]">
                            <button onClick={() => setOpenFaq(openFaq === idx ? null : idx)} className="w-full p-6 flex justify-between items-center text-left hover:bg-slate-800/50 transition-colors focus:outline-none group">
                                <span className="font-bold text-lg md:text-xl text-slate-100 group-hover:text-cyan-400 transition-colors">{faq.q}</span>
                                <div className={`w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-600 transition-colors ${openFaq === idx ? 'border-cyan-400 shadow-[0_0_15px_rgba(56,189,248,0.4)]' : 'group-hover:border-cyan-400 group-hover:shadow-[0_0_15px_rgba(56,189,248,0.4)]'}`}>
                                    <svg className={`w-6 h-6 text-cyan-400 transform transition-transform duration-300 ${openFaq === idx ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                            </button>
                            <div className="transition-all duration-300 ease-in-out bg-slate-900/80" style={{ maxHeight: openFaq === idx ? '500px' : '0', opacity: openFaq === idx ? 1 : 0, overflow: 'hidden' }}>
                                <p className="p-6 pt-0 text-slate-300 text-base leading-relaxed border-t border-slate-700/50 mt-4">{faq.a}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="relative overflow-hidden mt-10 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#064e3b] neon-border-bottom border-t-0 z-20">
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                    <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[150%] bg-blue-500/10 rotate-12 blur-3xl mix-blend-screen"></div>
                    <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[150%] bg-emerald-500/10 -rotate-12 blur-3xl mix-blend-screen"></div>
                </div>

                <div className="py-28 px-6 text-center max-w-3xl mx-auto relative z-10 fade-in-section">
                    <h2 className="text-5xl md:text-6xl font-extrabold mb-6 text-white text-shadow-glow">Ready to go global?</h2>
                    <p className="text-cyan-100 mb-12 text-xl font-medium text-shadow-md">Create your account today and start exploring transformative research projects abroad.</p>
                    <Link to="/signup" className="bg-gradient-to-r from-cyan-400 to-blue-500 text-white px-12 py-5 rounded-xl font-extrabold text-lg transition-all duration-300 inline-block shadow-[0_10px_30px_rgba(56,189,248,0.4)] hover:shadow-[0_15px_40px_rgba(56,189,248,0.6)] transform hover:-translate-y-2 hover:scale-105 border border-white/10">Register now</Link>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default LandingPage;