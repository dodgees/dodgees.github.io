/* FitPath journey: Omaha westward with cities, landmarks, parks, and fun detours.
   Distances are approximate motivational road miles (not GPS).
   Images: Wikimedia Commons — see CREDITS.md */
window.FITPATH_ROUTE = [
  {
    id: "omaha",
    name: "Omaha, Nebraska",
    shortName: "Omaha",
    milesFromStart: 0,
    kind: "start",
    blurb: "Home base on the Missouri. Lace up — every mile from here counts toward the horizon.",
    images: [
      { src: "images/omaha-1.jpg", credit: "Downtown Omaha skyline (Wikimedia Commons)" },
      { src: "images/omaha-2.jpg", credit: "Omaha skyline from Council Bluffs (Wikimedia Commons)" },
      { src: "images/omaha-3.jpg", credit: "Gene Leahy Mall, Omaha (Wikimedia Commons)" }
    ]
  },
  {
    id: "lincoln",
    name: "Lincoln, Nebraska",
    shortName: "Lincoln",
    milesFromStart: 58,
    kind: "city",
    blurb: "The Sower watches from the capitol tower. First real checkpoint on the prairie.",
    images: [
      { src: "images/lincoln-1.jpg", credit: "Nebraska State Capitol — Ammodramus (CC0)" },
      { src: "images/lincoln-2.jpg", credit: "Capitol dome and The Sower — Hanyou23 (CC BY-SA 4.0)" },
      { src: "images/lincoln-3.jpg", credit: "Lincoln Haymarket district (Wikimedia Commons)" }
    ]
  },
  {
    id: "kearney",
    name: "Kearney Archway",
    shortName: "Kearney",
    milesFromStart: 188,
    kind: "landmark",
    blurb: "The Great Platte River Road Archway straddles I-80 — a nod to pioneers who walked this valley.",
    images: [
      { src: "images/kearney-1.jpg", credit: "Great Platte River Road Archway — Hanyou23 (CC BY-SA 4.0)" },
      { src: "images/kearney-2.jpg", credit: "Archway over I-80 (Wikimedia Commons)" }
    ]
  },
  {
    id: "north-platte",
    name: "North Platte",
    shortName: "North Platte",
    milesFromStart: 280,
    kind: "city",
    blurb: "Golden Spike Tower looks over Bailey Yard, one of the world’s largest rail yards. Train-watching as a reward.",
    images: [
      { src: "images/north-platte-1.jpg", credit: "Golden Spike Tower area (Wikimedia Commons)" },
      { src: "images/north-platte-2.jpg", credit: "North Platte rail country (Wikimedia Commons)" }
    ]
  },
  {
    id: "chimney-rock",
    name: "Chimney Rock",
    shortName: "Chimney Rock",
    milesFromStart: 420,
    kind: "landmark",
    blurb: "The most-mentioned landmark in pioneer journals. If they could see it for days, you can grind for miles.",
    images: [
      { src: "images/chimney-rock-1.jpg", credit: "Chimney Rock, Western Nebraska — Gene Brown (CC BY-SA 4.0)" },
      { src: "images/chimney-rock-2.jpg", credit: "Chimney Rock National Historic Site (Wikimedia Commons)" }
    ]
  },
  {
    id: "scotts-bluff",
    name: "Scotts Bluff National Monument",
    shortName: "Scotts Bluff",
    milesFromStart: 470,
    kind: "park",
    blurb: "Towering bluffs that guided wagon trains. Your first National Park Service stop.",
    images: [
      { src: "images/scotts-bluff-1.jpg", credit: "Scotts Bluff National Monument (Wikimedia Commons)" },
      { src: "images/scotts-bluff-2.jpg", credit: "Saddle Rock, Scotts Bluff (Wikimedia Commons)" }
    ]
  },
  {
    id: "cheyenne",
    name: "Cheyenne, Wyoming",
    shortName: "Cheyenne",
    milesFromStart: 580,
    kind: "city",
    blurb: "Depot plaza and cowboy capital energy. You’ve crossed into Wyoming.",
    images: [
      { src: "images/cheyenne-1.jpg", credit: "Cheyenne Depot (Wikimedia Commons)" },
      { src: "images/cheyenne-2.jpg", credit: "Wyoming State Capitol, Cheyenne (Wikimedia Commons)" }
    ]
  },
  {
    id: "red-rocks",
    name: "Red Rocks Amphitheatre",
    shortName: "Red Rocks",
    milesFromStart: 700,
    kind: "landmark",
    blurb: "A concert venue carved into Dakota sandstone outside Denver. Miles deserve a soundtrack.",
    images: [
      { src: "images/red-rocks-1.jpg", credit: "Red Rocks Amphitheatre (Wikimedia Commons)" },
      { src: "images/red-rocks-2.jpg", credit: "Red Rocks stage and seating (Wikimedia Commons)" }
    ]
  },
  {
    id: "rocky-mountain",
    name: "Rocky Mountain National Park",
    shortName: "Rocky Mountain",
    milesFromStart: 780,
    kind: "park",
    blurb: "Alpine lakes, elk herds, and thin air. The prairie finally gives way to real peaks.",
    images: [
      { src: "images/rocky-mountain-1.jpg", credit: "Bierstadt Lake, Rocky Mountain NP (Wikimedia Commons)" },
      { src: "images/rocky-mountain-2.jpg", credit: "Dream Lake trail sunrise, RMNP (Wikimedia Commons)" },
      { src: "images/rocky-mountain-3.jpg", credit: "Rocky Mountain National Park vista (Wikimedia Commons)" }
    ]
  },
  {
    id: "glenwood",
    name: "Glenwood Springs",
    shortName: "Glenwood",
    milesFromStart: 920,
    kind: "city",
    blurb: "Hot springs after mountain miles. Soak the legs, then keep pushing west along the Colorado River.",
    images: [
      { src: "images/glenwood-1.jpg", credit: "Glenwood Springs, Colorado (Wikimedia Commons)" },
      { src: "images/glenwood-2.jpg", credit: "Glenwood Canyon / Colorado River (Wikimedia Commons)" }
    ]
  },
  {
    id: "colorado-nm",
    name: "Colorado National Monument",
    shortName: "Colorado NM",
    milesFromStart: 1000,
    kind: "park",
    blurb: "Redrock canyons above Grand Junction. A warm-up for the Utah desert ahead.",
    images: [
      { src: "images/colorado-nm-1.jpg", credit: "Colorado National Monument (Wikimedia Commons)" },
      { src: "images/colorado-nm-2.jpg", credit: "Independence Monument area (Wikimedia Commons)" }
    ]
  },
  {
    id: "arches",
    name: "Arches National Park",
    shortName: "Arches",
    milesFromStart: 1140,
    kind: "park",
    blurb: "Delicate Arch at sunset — red rock payoff for a long desert stretch.",
    images: [
      { src: "images/arches-1.jpg", credit: "Delicate Arch sunset (Wikimedia Commons)" },
      { src: "images/arches-2.jpg", credit: "Landscape Arch, Arches NP (Wikimedia Commons)" },
      { src: "images/arches-3.jpg", credit: "Arches National Park formations (Wikimedia Commons)" }
    ]
  },
  {
    id: "monument-valley",
    name: "Monument Valley",
    shortName: "Monument Valley",
    milesFromStart: 1400,
    kind: "landmark",
    blurb: "Buttes that defined the American West on film. Pure “keep going” scenery.",
    images: [
      { src: "images/monument-valley-1.jpg", credit: "Monument Valley (Wikimedia Commons)" },
      { src: "images/monument-valley-2.jpg", credit: "Monument Valley mittens (Wikimedia Commons)" }
    ]
  },
  {
    id: "horseshoe-bend",
    name: "Horseshoe Bend",
    shortName: "Horseshoe Bend",
    milesFromStart: 1540,
    kind: "landmark",
    blurb: "The Colorado River curls nearly full circle below Page. A quick, unforgettable overlook.",
    images: [
      { src: "images/horseshoe-bend-1.jpg", credit: "Horseshoe Bend, Arizona (Wikimedia Commons)" },
      { src: "images/horseshoe-bend-2.jpg", credit: "Horseshoe Bend overlook (Wikimedia Commons)" }
    ]
  },
  {
    id: "grand-canyon",
    name: "Grand Canyon National Park",
    shortName: "Grand Canyon",
    milesFromStart: 1680,
    kind: "park",
    blurb: "A mile deep and a lifetime wide. One of the great “you earned this” views on Earth.",
    images: [
      { src: "images/grand-canyon-1.jpg", credit: "Grand Canyon at Hopi Point (Wikimedia Commons)" },
      { src: "images/grand-canyon-2.jpg", credit: "Grand Canyon South Rim (Wikimedia Commons)" },
      { src: "images/grand-canyon-3.jpg", credit: "Grand Canyon layered cliffs (Wikimedia Commons)" }
    ]
  },
  {
    id: "hoover-dam",
    name: "Hoover Dam",
    shortName: "Hoover Dam",
    milesFromStart: 1910,
    kind: "landmark",
    blurb: "Concrete ambition across the Colorado. A human-made marvel after all that geology.",
    images: [
      { src: "images/hoover-dam-1.jpg", credit: "Hoover Dam (Wikimedia Commons)" },
      { src: "images/hoover-dam-2.jpg", credit: "Hoover Dam and Lake Mead (Wikimedia Commons)" }
    ]
  },
  {
    id: "las-vegas",
    name: "Las Vegas Strip",
    shortName: "Las Vegas",
    milesFromStart: 1960,
    kind: "city",
    blurb: "Neon intermission. Celebrate a few hundred miles with lights, then get back to dirt and stone.",
    images: [
      { src: "images/las-vegas-1.jpg", credit: "Las Vegas Strip (Wikimedia Commons)" },
      { src: "images/las-vegas-2.jpg", credit: "Las Vegas at night (Wikimedia Commons)" }
    ]
  },
  {
    id: "valley-of-fire",
    name: "Valley of Fire",
    shortName: "Valley of Fire",
    milesFromStart: 2040,
    kind: "landmark",
    blurb: "Nevada’s oldest state park — crimson sandstone just outside the city glow.",
    images: [
      { src: "images/valley-of-fire-1.jpg", credit: "Valley of Fire State Park (Wikimedia Commons)" },
      { src: "images/valley-of-fire-2.jpg", credit: "Valley of Fire formations (Wikimedia Commons)" }
    ]
  },
  {
    id: "zion",
    name: "Zion National Park",
    shortName: "Zion",
    milesFromStart: 2180,
    kind: "park",
    blurb: "Slot canyons and Angels Landing. Vertical sandstone after all those horizontal miles.",
    images: [
      { src: "images/zion-1.jpg", credit: "Great White Throne from Angels Landing (Wikimedia Commons)" },
      { src: "images/zion-2.jpg", credit: "Zion Canyon view (Wikimedia Commons)" },
      { src: "images/zion-3.jpg", credit: "The Narrows area, Zion (Wikimedia Commons)" }
    ]
  },
  {
    id: "bryce",
    name: "Bryce Canyon National Park",
    shortName: "Bryce Canyon",
    milesFromStart: 2270,
    kind: "park",
    blurb: "Hoodoos stacked like a stone amphitheater. Sunrise here is ridiculous in the best way.",
    images: [
      { src: "images/bryce-1.jpg", credit: "Bryce Canyon Amphitheater (Wikimedia Commons)" },
      { src: "images/bryce-2.jpg", credit: "Bryce Canyon hoodoos (Wikimedia Commons)" }
    ]
  },
  {
    id: "tahoe",
    name: "Lake Tahoe",
    shortName: "Lake Tahoe",
    milesFromStart: 2750,
    kind: "landmark",
    blurb: "Alpine blue water on the California–Nevada line. The Sierra is close now.",
    images: [
      { src: "images/tahoe-1.jpg", credit: "Lake Tahoe (Wikimedia Commons)" },
      { src: "images/tahoe-2.jpg", credit: "Lake Tahoe shoreline (Wikimedia Commons)" }
    ]
  },
  {
    id: "yosemite",
    name: "Yosemite National Park",
    shortName: "Yosemite",
    milesFromStart: 3020,
    kind: "park",
    blurb: "Half Dome from Glacier Point — the western finish line of this FitPath voyage.",
    images: [
      { src: "images/yosemite-1.jpg", credit: "Half Dome from Glacier Point — Diliff (CC BY-SA)" },
      { src: "images/yosemite-2.jpg", credit: "El Capitan, Yosemite (Wikimedia Commons)" },
      { src: "images/yosemite-3.jpg", credit: "Yosemite Valley view (Wikimedia Commons)" }
    ]
  }
];
