import { useId } from 'react';
import { motion, AnimatePresence, useIsPresent } from 'framer-motion';
export function Select({ value, onChange, disabled, children, label }) {
  return <select aria-label={label} value={value} onChange={onChange} disabled={disabled} className="cfg-inline-select">{children}</select>;
}

export function Checkbox({ checked, onChange, disabled, children, label }) {
  return (
    <label className="cb-label">
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} aria-label={label} />
      <span className="cb-box" aria-hidden="true" />
      <span className="cb-text">{children}</span>
    </label>
  );
}

function AccordionContent({ id, children }) {
  const isPresent = useIsPresent();
  return <motion.div id={id} inert={!isPresent} aria-hidden={!isPresent}
    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
    transition={{ type: 'spring', stiffness: 400, damping: 30 }} style={{ overflow: 'hidden' }}>
    <div className="cfg-accordion-body">{children}</div>
  </motion.div>;
}

export function Accordion({ title, open, onToggle, children }) {
  const contentId = useId();
  return (
    <div className="cfg-accordion">
      <button type="button" className="cfg-accordion-trigger" onClick={onToggle} aria-expanded={open} aria-controls={open ? contentId : undefined}>
        <span>{title}</span>
        <motion.svg 
          animate={{ rotate: open ? 180 : 0 }} 
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="cfg-accordion-chevron" 
          aria-hidden="true"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <AccordionContent id={contentId}>{children}</AccordionContent>
        )}
      </AnimatePresence>
    </div>
  );
}

