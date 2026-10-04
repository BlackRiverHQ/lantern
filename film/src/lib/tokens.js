// Shared tokens. Colours sampled from site/assets/css (the deployed landing page).
export const C = {
  bg: '#191919',        // --black-03
  card: '#212121',      // --black-02
  card2: '#282828',     // --black-01
  line: '#414042',      // --gray-09
  light: '#f8f8f8',     // --gray-01
  light2: '#e6e6e6',    // --gray-02
  mute: '#a7a9ac',      // --gray-05 (on dark: 8.0:1 vs #191919)
  muteDark: '#58595b',  // --gray-08 (on light: 6.9:1 vs #f8f8f8)
  ink: '#191919',
  lime: '#ddff46',      // --lime
  pink: '#ff35a2',      // --pink
  blue: '#405bff',      // --blue
  green: '#a9ff5e',     // --green
};

// Beat grid: Mixkit #130 "Tech House vibes", measured 123.05 BPM, first beat 0.070 s in the file.
// The film starts at file offset 0.070 so film beat n sits at n * B.
export const BPM = 123.046875;
export const B = 60 / BPM;          // 0.48762 s
export const BAR = 4 * B;            // 1.9505 s
export const beat = (n) => +(n * B).toFixed(4);

export const FONTS = `
@font-face{font-family:Disp;src:url(../assets/fonts/1c175694bc1e8ad8-s.p.woff2) format("woff2");font-weight:700}
@font-face{font-family:Disp;src:url(../assets/fonts/eb42eb886f642af5-s.p.woff2) format("woff2");font-weight:600}
@font-face{font-family:Disp;src:url(../assets/fonts/cbde3fd2db275844-s.p.woff2) format("woff2");font-weight:500}
@font-face{font-family:Body;src:url(../assets/fonts/c314d5394508c5c7-s.p.woff2) format("woff2");font-weight:400}
@font-face{font-family:Body;src:url(../assets/fonts/f5e01691c8be1cce-s.p.woff2) format("woff2");font-weight:500}
@font-face{font-family:Mono;src:url(../assets/fonts/06a57141b3ff4399-s.p.woff2) format("woff2");font-weight:400}
`;
