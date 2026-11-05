// Shared top menu bar — see navbar.css. items: [{ key, label, icon?, badge? }]
export default function NavBar({ items, active, onChange, variant, ariaLabel }) {
  return (
    <nav className={`nav-bar${variant === "inline" ? " nav-bar--inline" : ""}`} aria-label={ariaLabel}>
      {items.map(({ key, label, icon: Icon, badge }) => (
        <button key={key} type="button" className={`nav-btn${active === key ? " active" : ""}`}
          aria-current={active === key ? "page" : undefined} onClick={() => onChange(key)}>
          {Icon && <Icon size={19} strokeWidth={2.1} />}
          {label}
          {badge ? <span className="nav-badge">{badge > 99 ? "99+" : badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}
