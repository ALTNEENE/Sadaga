import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'


export const generateToken = async ({ id, role, name }) => {
  const accessToken = jwt.sign({ id, role, name }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  })

  return accessToken
}

export const setCookie = (res, accessToken) => {
  res.cookie("token", accessToken, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000
  })
}

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10)
  return await bcrypt.hash(password, salt)
}

export const compare = async (password, hasedPassword) => {
  return await bcrypt.compare(password, hasedPassword)
}