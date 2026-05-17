const { createServer } = require('./server')
const config = require('./config')

const app = createServer()
app.listen(config.port, () => {
  console.log(`claudify-deepseek proxy listening on :${config.port}`)
})
