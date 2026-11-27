export default function ContentRegion({ className = '', role, ...props }) {
  return <div
    {...props}
    className={className}
    role={role || (props['aria-label'] || props['aria-labelledby'] ? 'region' : 'group')}
  />;
}
