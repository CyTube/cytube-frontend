-- ARGV[1]: channel name
-- ARGV[2]: hash code of channel name
-- ARGV[3]: Current timestamp minus timeout period
-- return: URL of backend for channel or nil if not found

-- First check to see if the channel is already loaded somewhere
local loadedChannel = redis.call('get', 'channel-host:' .. ARGV[1])
if loadedChannel ~= false then
    return loadedChannel
end

-- Channel is not loaded yet, fetch all available backends and pick one
local allBackends = redis.call('hgetall', 'backend-hosts')
if #allBackends == 0 then
    return false
end

local addresses = {}
local expiration = tonumber(ARGV[3])
for i = 1, #allBackends, 2 do
    local uuid = allBackends[i]
    local entry = allBackends[i+1]
    local decoded = cjson.decode(entry)
    local address = decoded['address']
    local timestamp = decoded['lastUpdated']
    if timestamp < expiration then
        -- This backend has not updated its entry recently.
        -- Assume it is dead and remove it from the pool.
        redis.call('hdel', 'backend-hosts', uuid)
    else
        addresses[#addresses + 1] = address
    end
end

if #addresses == 0 then
    return false
else
    local index = (tonumber(ARGV[2]) % #addresses) + 1
    return addresses[index]
end
