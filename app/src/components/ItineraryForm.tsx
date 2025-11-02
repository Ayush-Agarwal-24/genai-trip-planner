



































































































































































      <section className="form-section">
        <h3>Themes & language</h3>
        <div className="theme-grid">
          {THEME_OPTIONS.map((theme) => {
            const active = formState.themes.includes(theme);
            return (
              <button
                key={theme}
                type="button"
                className={active ? 'pill pill--active' : 'pill'}
                onClick={() => handleCheckboxToggle(theme)}
              >
                {theme}
              </button>
            );
          })}
        </div>

        <label className="field field--select">
          <span>Preferred language</span>
          <select
            value={formState.language}
            onChange={(event) => setFormState((prev) => ({ ...prev, language: event.target.value }))}
          >
            {LANGUAGE_OPTIONS.map((language) => (
              <option key={language}>{language}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="form-section form-section--footer">
        <div className="form-actions" style={{ display: 'none' }} aria-hidden="true">
          <button type="submit" className="btn btn--primary" disabled={isDisabled}>
            {isSubmitting ? (
              <span className="btn-loading">
                <span className="spinner"><FaSpinner /></span>
                Crafting itineraryâ€¦
              </span>
            ) : (
              'Generate itinerary'
            )}
          </button>
          {cityError && <p className="form-card__error">{cityError}</p>}
        </div>
        <button type="submit" style={{ display: 'none' }} aria-hidden="true">Generate</button>
      </section>
      {/* Footer with visible Generate button for overlay usage */}
      <section className="form-section form-section--footer">
        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={isDisabled}>
            {isSubmitting ? (
              <span className="btn-loading">
                <span className="spinner"><FaSpinner /></span>
                Crafting itinerary…
              </span>
            ) : (
              'Generate itinerary'
            )}
          </button>
          {cityError && <p className="form-card__error">{cityError}</p>}
        </div>
        <button type="submit" style={{ display: 'none' }} aria-hidden="true">Generate</button>
      </section>
    </form>
  );
}

