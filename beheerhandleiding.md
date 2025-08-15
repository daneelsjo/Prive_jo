# Beheerhandleiding – Website Jo
_Laatst bijgewerkt: 15-08-2025 18:57_

Deze handleiding bundelt **alles** om de website te beheren, te onderhouden en uit te breiden.  
Ze bevat: structuur, technische toelichting per bestandstype, hosting & backups, inhoudsbeheer, changelog, troubleshooting én kant‑en‑klare templates (HTML/CSS/JS) voor nieuwe pagina’s, plus screenshot‑placeholders.

## 1. Inleiding & doel
- **Doel**: één centraal document voor beheer en ontwikkeling.
- **Bereik**: front‑end (HTML/CSS/JS), Firebase (Auth/Firestore), statische hosting (GitHub Pages of Firebase Hosting).
- **Niet in dit document**: API‑sleutels/privéconfiguratie.

## 2. Bestandsstructuur
```
/CSS
  main.css
  components-menu.css
  components-sidemenu.css
  page-index.css
  page-notes.css
  page-settings.css

/Script/Javascript
  main.js
  notes.js
  settings.js
  menu.js
  modal.js
  include-partials.js
  firebase-config.js

/HTML
  index.html
  notes.html
  settings.html
  modals.html
  header.html
```

## 3. Technische toelichting per bestandstype
### CSS
- main.css – basisstijl, thema’s
- components-menu.css – menu styling
- components-sidemenu.css – zijmenu styling
- page-* – paginaspecifieke stijlen

### JavaScript
- include-partials.js – laadt gedeelde HTML-componenten
- menu.js – navigatie en menu logica
- modal.js – modals functionaliteit
- main.js, notes.js, settings.js – pagina scripts
- firebase-config.js – Firebase instellingen

### HTML
- index.html – startpagina
- notes.html – notities
- settings.html – instellingen
- modals.html – modals
- header.html – header en menu

## 4. Hosting & backups
- Hosting op GitHub Pages of Firebase Hosting
- Backups via Git-tags en ZIP-export
- Firestore Rules & Auth configuratie

## 5. Inhoudsbeheer
- Taken: toevoegen, bewerken, voltooien
- Categorieën: naam, kleur, archiveren
- Post-its per modus (werk/privé)
- Notities: tabel, toevoegen, bewerken

## 6. Nieuwe pagina boilerplate
```html
<link rel="stylesheet" href="CSS/main.css" />
<link rel="stylesheet" href="CSS/components-menu.css" />
<link rel="stylesheet" href="CSS/components-sidemenu.css" />
<link rel="stylesheet" href="CSS/page-[NAAM].css" />

<script src="Script/Javascript/include-partials.js"></script>
<script src="Script/Javascript/menu.js"></script>
<script type="module" src="Script/Javascript/[NAAM].js"></script>
```

## 7. Volledige HTML-template nieuwe pagina
```html
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>[PAGINATITEL]</title>
  <link rel="stylesheet" href="CSS/main.css" />
  <link rel="stylesheet" href="CSS/components-menu.css" />
  <link rel="stylesheet" href="CSS/components-sidemenu.css" />
  <link rel="stylesheet" href="CSS/page-[NAAM].css" />
</head>
<body class="page-[NAAM]">
  <div data-include="partials/header.html"></div>
  <main class="content"></main>
  <div data-include="partials/modals.html"></div>
  <script src="Script/Javascript/include-partials.js"></script>
  <script src="Script/Javascript/menu.js"></script>
  <script type="module" src="Script/Javascript/[NAAM].js"></script>
</body>
</html>
```

## 8. Screenshot placeholders
- [SCREENSHOT: Startpagina]
- [SCREENSHOT: Notitiespagina]
- [SCREENSHOT: Instellingenpagina]

## 9. Changelog
```
[15-08-2025] v1.0.0 – Eerste volledige beheershandleiding
```