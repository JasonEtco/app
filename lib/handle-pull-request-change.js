module.exports = handlePullRequestChange

const getStatusFree = require('./free/get-status')
const setStatusFree = require('./free/set-status')

const getStatusPro = require('./pro/get-status')
const setStatusPro = require('./pro/set-status')

const hasStatusChange = require('./common/has-status-change')
const getPlan = require('./common/get-plan')

async function handlePullRequestChange (app, context) {
  const {action, pull_request: pr, repository: repo} = context.payload
  const accountId = repo.owner.id

  try {
    // 1. get new status based on marketplace plan
    const plan = await getPlan(app, accountId)
    const newStatus = plan === 'free' ? await getStatusFree(context) : await getStatusPro(context)
    const isWip = newStatus === 'pending'
    const logStatus = isWip ? '⏳' : '✅'
    const shortUrl = `${repo.full_name}#${pr.number}`

    // 2. if status did not change then don’t create a new check run. Quotas for
    //    mutations are more restrictive so we want to avoid them if possible
    const hasChange = hasStatusChange(newStatus)
    const log = context.log.child({
      name: 'wip',
      event: context.event.event,
      action,
      account: repo.owner.id,
      plan,
      repo: repo.id,
      change: hasChange,
      wip: newStatus.wip
    })

    // if status did not change then don’t call .createStatus. Quotas for mutations
    // are much more restrictive so we want to avoid them if possible
    if (!hasChange) {
      return log.info(`😐${logStatus} ${shortUrl}`)
    }

    // 3. Create check run
    if (plan === 'free') {
      await setStatusFree(newStatus, context)
    } else {
      await setStatusPro(newStatus, context)
    }

    log.info(`💾${logStatus} ${shortUrl}`)
  } catch (error) {
    context.log.error(error)
  }
}
