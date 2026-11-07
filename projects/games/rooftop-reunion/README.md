# 天台再见 / Rooftop Reunion

An exploratory three-dimensional blockout of a private rooftop cinema above a
stepped shopping centre. The supplied two-page drawing establishes the mall
massing and four rooftop relationships: cinema at the rear, swing on the left,
recessed platform in the middle, and stair entrance at the front-right.

No dimensions were supplied. The model uses provisional proportions: the roof
is roughly 32 by 25 model units and the central platform is about one unit
lower. Street context, millennium-era chrome/glass facade, seating, lights,
planting, two screening rooms and reception are creative additions. This is
an editable scene prototype, not a measured survey or finished narrative game.

`app.mjs` contains the scene geometry, lighting and viewpoint controls. The
cinema envelope is grouped separately for cutaway inspection. The primary
views show the whole mall, rooftop, top-down layout and cinema interior.
Location markers select views; the swing and screening panels respond to the
context button. Mouse drag, touch gestures and arrow keys control the camera.
The fixed site header contains the parent return link.

Three.js 0.180.0 and OrbitControls are self-hosted in `vendor/`; the upstream
license is preserved there. The OrbitControls import points to the local
module. No build step, account, external assets or service is required.
