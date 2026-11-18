Brand logos. Use a logo file. Never draw a logo by hand.

Rule (Joe, Nov 18, 2026): he sent the Google G and asked for Facebook, Instagram and Yelp buttons in their colors.
The files here come from open logo libraries on npm, written out by a script with no change to the shapes:

  google.svg     the four color G        @iconify-json/logos 1.2.20 "google-icon" (CC0)
  instagram.svg  the full color mark     @iconify-json/skill-icons 1.2.4 "instagram" (MIT)
  facebook.svg   the mark in white       @iconify-json/simple-icons 1.2.103 "facebook" (CC0), fill set to white
  yelp.svg       the mark in white       @iconify-json/simple-icons 1.2.103 "yelp" (CC0), fill set to white

The names and marks belong to their owners. We use them only as links to our own profiles.
A file from the company's own brand page can replace any of these: keep the file name.

Social buttons (footer of every page). A button shows when its file is here AND its link is in src/site.config.json "social":
  facebook.svg  instagram.svg  yelp.svg  tiktok.svg  nextdoor.svg
  Facebook and Yelp sit on their own brand color (set in build/build.mjs, SOCIAL), so those two files are the white mark.

Google mark (in front of the stars in the home page hero):
  google.svg

Payment marks (footer, under Payment options, each on a small white tile). All six are from @iconify-json/logos 1.2.20 (CC0):
  visa.svg  mastercard.svg  amex.svg  discover.svg  apple-pay.svg  google-pay.svg

.svg, .png or .webp all work. File names are lower case with dashes.
