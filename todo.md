- image2ascii
    - benchmark unicodes => char gradient [almost done]
        - puppeteer/selenium whatever but just dont do it manually, damn. Run over every unicode block for asciiGradient.js valid ranges

- place album image anywhere based on user defined x,y coords and set css pos to absolute
- make 2 canvases 1 for background 1 for rain (that way images can be drawn separately and not constantly, slowing down rain code)

- add another audio animation where you create a flattened 2D map of droplets and only flow when there's audio

- refactor this whole BS into modules cause I think we reached the point where we gotta start cleaning