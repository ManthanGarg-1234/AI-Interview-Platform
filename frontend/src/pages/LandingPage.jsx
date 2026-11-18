import { motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowRight, BarChart3, BriefcaseBusiness, Check, Code2, FileCheck2, Moon, Sparkles, Sun, Video, WandSparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { Button, Card } from "../components/ui";

const rise = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

const features = [
  { icon: Video, label: "AI interview practice", title: "Walk into interviews with a plan.", text: "Practice role-specific questions, sharpen your answers, and get clear feedback on what to improve.", to: "/student/interviews", action: "Explore interview practice" },
  { icon: FileCheck2, label: "Resume intelligence", title: "Make every line work harder.", text: "Understand how your resume aligns to a role, spot missing details, and improve your application with focused guidance.", to: "/student/resume-analysis", action: "Explore resume analysis" },
  { icon: Code2, label: "Technical preparation", title: "Build skills by doing.", text: "Strengthen problem-solving with structured coding practice and a workspace built for deliberate repetition.", to: "/student/coding", action: "Explore coding practice" },
];

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const reveal = reduceMotion ? {} : { initial: "hidden", whileInView: "visible", viewport: { once: true, amount: 0.16 }, variants: rise };

  return (
    <div className="lp-shell">
      <header className="lp-nav">
        <Link to="/" className="lp-brand" aria-label="CareerPrepAI home">
          <span className="lp-mark">C</span><span>CareerPrep<span className="lp-brand-accent">AI</span></span>
        </Link>
        <nav className="lp-nav-links" aria-label="Main navigation">
          <a href="#platform">Platform</a><a href="#how-it-works">How it works</a><a href="#recruiters">For recruiters</a>
        </nav>
        <div className="lp-nav-actions">
          <button type="button" className="lp-theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <Link className="lp-login" to="/login">Log in</Link>
          <Button as={Link} to="/register" className="lp-nav-cta">Get started <ArrowRight size={16} /></Button>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <motion.div {...reveal} className="lp-hero-copy">
            <div className="lp-eyebrow"><Sparkles size={15} /> Career growth, with a clearer next step</div>
            <h1>Turn your potential into <span>your next opportunity.</span></h1>
            <p className="lp-hero-description">Prepare Smarter. Interview Better. Get Hired.</p>
            <p className="lp-hero-subtext">Build confidence with practical interview preparation, role-aware resume guidance, and technical practice—all in one place.</p>
            <div className="lp-hero-actions">
              <Button as={Link} to="/register" className="lp-primary-cta">Start preparing <ArrowRight size={17} /></Button>
              <a className="lp-secondary-cta" href="#platform">Discover the platform <ArrowDown size={16} /></a>
            </div>
            <div className="lp-proof"><span className="lp-proof-icon"><Check size={14} /></span> A focused workspace for every step from preparation to hiring.</div>
          </motion.div>

          <motion.div {...(reduceMotion ? {} : { initial: { opacity: 0, scale: 0.96, y: 12 }, animate: { opacity: 1, scale: 1, y: 0 }, transition: { duration: 0.65, delay: 0.12 } })} className="lp-preview-wrap" aria-label="Interview preparation interface preview">
            <div className="lp-orbit lp-orbit-one" /><div className="lp-orbit lp-orbit-two" />
            <Card className="lp-preview-card">
              <div className="lp-preview-top"><div><p className="lp-preview-kicker">PRACTICE ROOM PREVIEW</p><h2>Behavioral interview</h2></div><span className="lp-live-dot">Ready</span></div>
              <div className="lp-preview-question"><span className="lp-question-number">01</span><p>Tell me about a time you solved a difficult problem with your team.</p></div>
              <div className="lp-audio-wave" aria-hidden="true">{Array.from({ length: 34 }, (_, index) => <i key={index} style={{ "--bar-height": `${14 + ((index * 19) % 38)}px` }} />)}</div>
              <div className="lp-preview-bottom"><span><span className="lp-mic-dot" /> Ready when you are</span><span>Practice at your pace</span></div>
            </Card>
            <div className="lp-floating-note"><span className="lp-note-icon"><WandSparkles size={17} /></span><span><strong>Thoughtful feedback</strong><small>Know what to work on next</small></span></div>
          </motion.div>
        </section>

        <section className="lp-trust-strip" aria-label="Platform capabilities">
          <p>One connected space to</p><span><Video size={16} /> Practice</span><span><FileCheck2 size={16} /> Prepare</span><span><BarChart3 size={16} /> Progress</span><span><BriefcaseBusiness size={16} /> Get hired</span>
        </section>

        <section id="platform" className="lp-section lp-features">
          <motion.div {...reveal} className="lp-section-heading">
            <span className="lp-eyebrow">YOUR CAREER TOOLKIT</span>
            <h2>Make preparation feel <span>purposeful.</span></h2>
            <p>Build momentum through practical tools that work together—not another collection of disconnected tasks.</p>
          </motion.div>
          <div className="lp-feature-grid">
            {features.map(({ icon: Icon, label, title, text, to, action }, index) => (
              <motion.div key={label} {...(reduceMotion ? {} : { initial: "hidden", whileInView: "visible", viewport: { once: true }, variants: rise, transition: { delay: index * 0.1 } })}>
                <Card className="lp-feature-card">
                  <span className="lp-feature-icon"><Icon size={21} /></span><p className="lp-feature-label">{label}</p>
                  <h3>{title}</h3><p className="lp-card-copy">{text}</p>
                  <Link to={to} className="lp-feature-link">{action}<ArrowRight size={15} /></Link>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="lp-deep-dive lp-interview-section">
          <motion.div {...reveal} className="lp-deep-copy"><span className="lp-eyebrow">AI INTERVIEW PRACTICE</span><h2>Practice the conversation. <span>Build real confidence.</span></h2><p>Get a structured place to rehearse, reflect on your responses, and prepare for the questions that matter to your goals.</p><ul><li><Check size={16} /> Practice on your schedule</li><li><Check size={16} /> Review clear, actionable feedback</li><li><Check size={16} /> Track practice sessions over time</li></ul><Button as={Link} to="/student/interviews" variant="secondary" className="lp-outline-cta">Explore interview practice <ArrowRight size={16} /></Button></motion.div>
          <div className="lp-interview-art" aria-hidden="true"><div className="lp-art-window"><div className="lp-art-window-bar"><i /><i /><i /><span>Interview practice</span></div><div className="lp-art-content"><div className="lp-art-avatar">You</div><div className="lp-art-prompt"><span>YOUR QUESTION</span><strong>What motivates you in your work?</strong><small>Take a moment to think, then start when you’re ready.</small></div><div className="lp-art-controls"><span /><span /><b>Start response</b></div></div></div><div className="lp-art-spark"><Sparkles size={18} /></div></div>
        </section>

        <section className="lp-deep-dive lp-resume-section">
          <div className="lp-resume-art" aria-hidden="true"><div className="lp-resume-sheet"><span className="lp-resume-heading" /><span className="lp-resume-line short" /><span className="lp-resume-section-title">EXPERIENCE</span><span className="lp-resume-line" /><span className="lp-resume-line" /><span className="lp-resume-line short" /><span className="lp-resume-section-title">SKILLS</span><div className="lp-skill-pills"><i /><i /><i /><i /></div><div className="lp-resume-score"><span className="lp-score-ring">✓</span><span><b>Role alignment</b><small>Guidance for your next edit</small></span></div></div></div>
          <motion.div {...reveal} className="lp-deep-copy"><span className="lp-eyebrow">RESUME ANALYSIS</span><h2>A stronger resume starts with <span>clearer insight.</span></h2><p>See how your resume speaks to a target role. Get useful feedback on relevance and readability so you can make informed edits yourself.</p><ul><li><Check size={16} /> Review role-specific alignment</li><li><Check size={16} /> Find areas that need more detail</li><li><Check size={16} /> Keep every change under your control</li></ul><Button as={Link} to="/student/resume-analysis" variant="secondary" className="lp-outline-cta">Explore resume analysis <ArrowRight size={16} /></Button></motion.div>
        </section>

        <section className="lp-coding-band">
          <div className="lp-code-glyph"><Code2 size={28} /></div><div><span className="lp-eyebrow">TECHNICAL PREPARATION</span><h2>Make progress one problem at a time.</h2><p>Practice coding with a focused workspace and keep your preparation moving at a steady pace.</p></div><Button as={Link} to="/student/coding" variant="secondary" className="lp-outline-cta">Explore coding practice <ArrowRight size={16} /></Button>
        </section>

        <section id="recruiters" className="lp-recruiter-section">
          <motion.div {...reveal} className="lp-recruiter-copy"><span className="lp-eyebrow">FOR RECRUITERS</span><h2>Meet candidates through a <span>more connected process.</span></h2><p>Bring job, candidate, assessment, and interview steps into a shared hiring workspace—so your team can stay aligned from first review to final conversation.</p><Button as={Link} to="/login" variant="secondary" className="lp-outline-cta">Recruiter sign in <ArrowRight size={16} /></Button></motion.div>
          <div className="lp-hiring-flow" aria-label="Hiring workflow: Roles, Candidates, Interviews">
            <div className="lp-flow-step"><span>01</span><BriefcaseBusiness size={18} /><b>Roles</b><small>Shape the opportunity</small></div><ArrowRight className="lp-flow-arrow" size={18} /><div className="lp-flow-step"><span>02</span><BarChart3 size={18} /><b>Candidates</b><small>Review with context</small></div><ArrowRight className="lp-flow-arrow" size={18} /><div className="lp-flow-step"><span>03</span><Video size={18} /><b>Interviews</b><small>Move forward together</small></div>
          </div>
        </section>

        <section id="how-it-works" className="lp-section lp-workflow">
          <motion.div {...reveal} className="lp-section-heading"><span className="lp-eyebrow">A CLEARER WAY FORWARD</span><h2>Small steps. <span>Steady progress.</span></h2><p>Use one workspace to turn a broad goal into practical next actions.</p></motion.div>
          <div className="lp-steps">
            {[["01", "Set your direction", "Choose what you’re preparing for and start with the skills or roles that matter to you."], ["02", "Practice with purpose", "Work through interview, resume, and coding preparation at your own pace."], ["03", "Reflect and improve", "Use feedback and progress signals to decide what to focus on next."], ["04", "Move toward opportunity", "Bring your preparation together when it’s time to apply and interview."]].map(([number, title, text]) => <article className="lp-step" key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}
          </div>
        </section>

        <section className="lp-final-cta"><div><span className="lp-eyebrow">YOUR NEXT STEP STARTS HERE</span><h2>Show up ready for what’s next.</h2><p>Prepare Smarter. Interview Better. Get Hired.</p></div><Button as={Link} to="/register" className="lp-primary-cta">Create your account <ArrowRight size={17} /></Button></section>
      </main>

      <footer className="lp-footer"><Link to="/" className="lp-brand"><span className="lp-mark">C</span><span>CareerPrep<span className="lp-brand-accent">AI</span></span></Link><p>Prepare Smarter. Interview Better. Get Hired.</p><div><Link to="/login">Log in</Link><Link to="/register">Get started</Link><Link to="/forgot-password">Account help</Link></div><small>© {new Date().getFullYear()} CareerPrepAI. Built for your next opportunity.</small></footer>
    </div>
  );
}
