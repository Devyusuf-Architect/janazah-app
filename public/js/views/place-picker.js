// Choosing a prayer hall or a cemetery when writing a Janazah notice.
//
// The same job the registration form does for a masjid's own address, and it
// exists for the same reason: nobody in a masjid office should be asked for
// latitude and longitude. They were, here, until now — which meant the one
// screen used under real time pressure, by someone arranging a funeral, was
// the screen still asking for two decimal numbers looked up in Google Maps.
//
// What the coordinates decide: whether the notice reaches people near enough
// to attend (location.js, functions/lib/topics.js) and whether the Directions
// link opens the right building. Both fail silently when they are wrong, and
// nobody finds out until somebody misses a Janazah.
//
// Two inputs, not one, and deliberately so. The *name* is a human label —
// "Main prayer hall", "Sisters' entrance", "Meadowvale Cemetery" — and stays
// typed. The *address* is picked from the geocoder, because that is what
// carries the coordinates.

import { el, icon } from '../ui.js';
import { searchAddresses } from '../geocode.js';
import { centreFor, countryName } from '../regions.js';

/**
 * @param {object} options
 * @param {string} options.prefix        Field-name prefix: 'prayer' or 'burial'.
 * @param {string} options.legend        Heading shown above the group.
 * @param {string} options.nameLabel
 * @param {boolean} [options.required]
 * @param {object} [options.org]         Scopes the search and supplies the shortcut.
 * @param {string} [options.shortcutLabel] Offer the organization's own address.
 * @param {string} [options.hint]
 * @param {string} [options.nameHint]
 */
export function placePicker({
  prefix, legend, nameLabel, required = false, org = null,
  shortcutLabel = null, hint = null,
  nameHint = 'What mourners should look for when they arrive.',
}) {
  let controller = null;
  let debounce = null;

  const nameInput = el('input', {
    class: 'field', id: `${prefix}Name`, name: `${prefix}Name`,
    maxlength: 140, autocomplete: 'off',
  });

  const search = el('input', {
    class: 'field', id: `${prefix}Search`, type: 'text', autocomplete: 'off',
    role: 'combobox', 'aria-expanded': 'false',
    'aria-controls': `${prefix}-results`, 'aria-autocomplete': 'list',
    placeholder: 'Start typing the street address',
  });
  const results = el('ul', {
    class: 'address-results', id: `${prefix}-results`, role: 'listbox', hidden: true,
  });
  const status = el('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const chosen = el('div', { class: 'address-chosen', hidden: true });

  // What readForm() collects and buildPublicNotice() reads. Unchanged names,
  // so the model, the rules mirror and every existing test still line up.
  const addressInput = el('input', { type: 'hidden', name: `${prefix}Address` });
  const latInput = el('input', { type: 'hidden', name: `${prefix}Lat` });
  const lngInput = el('input', { type: 'hidden', name: `${prefix}Lng` });

  const clearResults = () => {
    results.replaceChildren();
    results.hidden = true;
    search.setAttribute('aria-expanded', 'false');
  };

  const hasPlace = () => Boolean(latInput.value && lngInput.value && addressInput.value);

  /** Paint the confirmation from whatever the hidden inputs currently hold. */
  const paintChosen = () => {
    if (!hasPlace()) {
      chosen.hidden = true;
      chosen.replaceChildren();
      return;
    }
    chosen.hidden = false;
    chosen.replaceChildren(
      el('p', { class: 'address-chosen__label' }, [
        el('strong', { text: 'Selected location: ' }),
        el('span', { text: addressInput.value }),
      ]),
      // Checking against a map matters: an address that geocodes to the wrong
      // side of a city sends every nearby alert to the wrong people, and the
      // Directions link sends mourners to the wrong building.
      el('a', {
        class: 'link', target: '_blank', rel: 'noopener noreferrer',
        href: `https://www.google.com/maps/search/?api=1&query=${latInput.value},${lngInput.value}`,
      }, 'Check this on a map'),
      el('button', {
        class: 'btn btn--small btn--quiet', type: 'button',
        onclick: () => { clearPlace(); search.value = ''; search.focus(); },
      }, 'Change'),
    );
  };

  function clearPlace() {
    addressInput.value = '';
    latInput.value = '';
    lngInput.value = '';
    clearResults();
    status.textContent = '';
    paintChosen();
  }

  function usePlace({ address, lat, lng, name }) {
    addressInput.value = address;
    latInput.value = String(lat);
    lngInput.value = String(lng);
    search.value = address;
    // Only ever fills a blank name. Somebody who typed "Main prayer hall"
    // does not want it replaced by whatever the geocoder calls the building.
    if (!nameInput.value.trim() && name) nameInput.value = name;
    clearResults();
    status.textContent = '';
    paintChosen();
  }

  const runSearch = async (query) => {
    controller?.abort();
    controller = new AbortController();
    status.textContent = 'Searching…';
    try {
      const places = await searchAddresses(query, {
        signal: controller.signal,
        // Scoped to the organization's own country and province. A Janazah is
        // nearly always in the masjid's own region, and an unscoped search is
        // how a prayer hall lands on a same-named street in another country.
        country: org?.country || countryName('CA'),
        region: org?.province || '',
        centre: org && Number.isFinite(org.lat)
          ? { lat: org.lat, lon: org.lng }
          : centreFor('CA'),
      });
      if (!places.length) {
        clearResults();
        status.textContent = 'No matching address found. Try the street address on its own.';
        return;
      }
      status.textContent = '';
      results.replaceChildren(...places.map((place) => {
        const item = el('li', { class: 'address-result', role: 'option', tabindex: '0' },
          [el('span', { text: place.label })]);
        const pick = () => usePlace({
          address: place.address ? [place.address, place.city].filter(Boolean).join(', ') : place.label,
          lat: place.lat,
          lng: place.lng,
          name: place.name,
        });
        item.addEventListener('click', pick);
        item.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(); }
        });
        return item;
      }));
      results.hidden = false;
      search.setAttribute('aria-expanded', 'true');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('searchAddresses', err);
      clearResults();
      status.textContent = 'Address lookup is unavailable right now. '
        + 'You can still save this as a draft and add the location shortly.';
    }
  };

  search.addEventListener('input', () => {
    // Typing invalidates the previous pick: the box no longer shows what was
    // selected, and treating it as still selected would publish coordinates
    // that do not match the address on screen.
    const typed = search.value;
    clearPlace();
    search.value = typed;

    clearTimeout(debounce);
    const query = typed.trim();
    if (query.length < 3) return;
    debounce = setTimeout(() => runSearch(query), 300);
  });

  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') clearResults();
    // Enter in a search box must not submit a notice that has no coordinates.
    if (event.key === 'Enter') { event.preventDefault(); results.firstChild?.focus(); }
  });

  // Most Janazahs are prayed at the masjid that is publishing the notice, and
  // that address is already on file with coordinates an administrator checked
  // during verification. One button beats retyping it.
  const shortcut = shortcutLabel && org && Number.isFinite(org.lat)
    ? el('button', {
      class: 'btn btn--small', type: 'button', id: `${prefix}UseOrg`,
      onclick: () => usePlace({
        address: [org.address, org.city, org.province].filter(Boolean).join(', '),
        lat: org.lat,
        lng: org.lng,
        name: org.name,
      }),
    }, [icon('building', { size: 15 }), el('span', { text: shortcutLabel })])
    : null;

  const node = el('div', { class: 'place-picker' }, [
    el('h3', { class: 'place-picker__legend', text: legend }),
    hint ? el('p', { class: 'hint', text: hint }) : null,
    shortcut ? el('div', { class: 'place-picker__shortcut' }, [shortcut]) : null,
    el('div', { class: 'field-group' }, [
      el('label', { class: 'label', for: `${prefix}Name`, text: nameLabel }),
      nameInput,
      el('p', { class: 'hint', text: nameHint }),
    ]),
    el('div', { class: 'field-group address-picker' }, [
      el('label', { class: 'label', for: `${prefix}Search`, text: 'Address' }),
      search,
      results,
      status,
      chosen,
    ]),
    addressInput, latInput, lngInput,
  ]);

  return {
    node,

    /**
     * Repaint from the hidden inputs after fillForm() has written into them.
     * Correcting an existing notice must open showing the location it already
     * has, not an empty search box that looks like the address was lost.
     */
    hydrate: () => {
      if (hasPlace()) search.value = addressInput.value;
      paintChosen();
    },

    /**
     * What is still missing, or null. A location half-entered is worse than
     * one left blank: a name with no coordinates publishes a notice no nearby
     * search can find and no Directions link can open.
     */
    missing: () => {
      const named = nameInput.value.trim();
      if (required && !named) {
        return { message: `Enter the ${nameLabel.toLowerCase()}.`, focus: nameInput };
      }
      if (required && !hasPlace()) {
        return {
          message: 'Choose the address from the suggestions, so mourners get '
                 + 'working directions and people nearby are told.',
          focus: search,
        };
      }
      if (!required && (named || search.value.trim()) && !hasPlace()) {
        return {
          message: `Choose the ${legend.toLowerCase()} address from the `
                 + 'suggestions, or clear it if there is no burial location yet.',
          focus: search,
        };
      }
      if (!required && hasPlace() && !named) {
        return { message: `Enter the ${nameLabel.toLowerCase()}.`, focus: nameInput };
      }
      return null;
    },
  };
}
