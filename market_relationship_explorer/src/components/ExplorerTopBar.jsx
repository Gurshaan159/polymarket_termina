import styles from "../styles/ExplorerTopBar.module.css";

export function ExplorerTopBar({
  title,
  searchQuery,
  onSearchQueryChange,
  categories,
  selectedCategory,
  onCategoryChange,
  activeOnly,
  onActiveOnlyChange,
  marketsCount,
  eventsCount,
}) {
  return (
    <header className={styles.topBar}>
      <div className={styles.titleWrap}>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.subtitle}>
          {marketsCount} markets indexed from {eventsCount} active events
        </div>
      </div>

      <div className={styles.controls}>
        <input
          className={styles.searchInput}
          type="search"
          value={searchQuery}
          placeholder="Search markets, events, tags, teams, entities..."
          onChange={(event) => onSearchQueryChange(event.target.value)}
        />

        <select
          className={styles.select}
          value={selectedCategory}
          onChange={(event) => onCategoryChange(event.target.value)}
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(event) => onActiveOnlyChange(event.target.checked)}
          />
          Active only
        </label>
      </div>
    </header>
  );
}
