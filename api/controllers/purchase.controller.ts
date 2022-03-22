import { Request, Response } from 'express'
import { STATUS_PURCHASE } from '../constants/purchase'
import { STATUS } from '../constants/status'
import { ProductModel } from '../database/models/product.model'
import { PurchaseModel } from '../database/models/purchase.model'
import { ErrorHandler, responseSuccess } from '../utils/response'
import { handleImageProduct } from './product.controller'
import { cloneDeep } from 'lodash'
import { UserModel } from '../database/models/user.model'


export const addToCart = async (req: Request, res: Response) => {
  const { product_id, buy_count } = req.body
  const product: any = await ProductModel.findById(product_id).lean()
  if (product) {
    if (buy_count > product.quantity) {
      throw new ErrorHandler(
        STATUS.NOT_ACCEPTABLE,
        'Số lượng vượt quá số lượng sản phẩm'
      )
    }
    const purchaseInDb: any = await PurchaseModel.findOne({
      user: req.jwtDecoded.id,
      status: STATUS_PURCHASE.IN_CART,
      product: {
        _id: product_id,
      },
    }).populate({
      path: 'product',
      populate: {
        path: 'category',
      },
    })
    let data
    if (purchaseInDb) {
      data = await PurchaseModel.findOneAndUpdate(
        {
          user: req.jwtDecoded.id,
          status: STATUS_PURCHASE.IN_CART,
          product: {
            _id: product_id,
          },
        },
        {
          buy_count: purchaseInDb.buy_count + buy_count,
        },
        {
          new: true,
        }
      )
        .populate({
          path: 'product',
          populate: {
            path: 'category',
          },
        })
        .lean()
    } else {
      const purchase = {
        user: req.jwtDecoded.id,
        product: product._id,
        buy_count: buy_count,
        price: product.price,
        price_before_discount: product.price_before_discount,
        status: STATUS_PURCHASE.IN_CART,
      }
      const addedPurchase = await new PurchaseModel(purchase).save()
      data = await PurchaseModel.findById(addedPurchase._id).populate({
        path: 'product',
        populate: {
          path: 'category',
        },
      })
    }
    const response = {
      message: 'Thêm sản phẩm vào giỏ hàng thành công',
      data,
    }
    return responseSuccess(res, response)
  } else {
    throw new ErrorHandler(STATUS.NOT_FOUND, 'Không tìm thấy sản phẩm')
  }
}

export const updatePurchase = async (req: Request, res: Response) => {
  const { product_id, buy_count } = req.body
  const purchaseInDb: any = await PurchaseModel.findOne({
    user: req.jwtDecoded.id,
    status: STATUS_PURCHASE.IN_CART,
    product: {
      _id: product_id,
    },
  })
    .populate({
      path: 'product',
      populate: {
        path: 'category',
      },
    })
    .lean()
  if (purchaseInDb) {
    if (buy_count > purchaseInDb.product.quantity) {
      throw new ErrorHandler(
        STATUS.NOT_ACCEPTABLE,
        'Số lượng vượt quá số lượng sản phẩm'
      )
    }
    const data = await PurchaseModel.findOneAndUpdate(
      {
        user: req.jwtDecoded.id,
        status: STATUS_PURCHASE.IN_CART,
        product: {
          _id: product_id,
        },
      },
      {
        buy_count,
      },
      {
        new: true,
      }
    )
      .populate({
        path: 'product',
        populate: {
          path: 'category',
        },
      })
      .lean()
    const response = {
      message: 'Cập nhật đơn thành công',
      data,
    }
    return responseSuccess(res, response)
  } else {
    throw new ErrorHandler(STATUS.NOT_FOUND, 'Không tìm thấy đơn')
  }
}

export const buyProducts = async (req: Request, res: Response) => {
  const purchases = []
  for (const item of req.body) {
    const product: any = await ProductModel.findById(item.product_id).lean()
    if (product) {
      if (item.buy_count > product.quantity) {
        throw new ErrorHandler(
          STATUS.NOT_ACCEPTABLE,
          'Số lượng mua vượt quá số lượng sản phẩm'
        )
      } else {
        let data = await PurchaseModel.findOneAndUpdate(
          {
            user: req.jwtDecoded.id,
            status: STATUS_PURCHASE.IN_CART,
            product: {
              _id: item.product_id,
            },
          },
          {
            buy_count: item.buy_count,
            status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION,
          },
          {
            new: true,
          }
        )
          .populate({
            path: 'product',
            populate: {
              path: 'category',
            },
          })
          .lean()
        if (!data) {
          const purchase = {
            user: req.jwtDecoded.id,
            product: item.product_id,
            buy_count: item.buy_count,
            price: product.price,
            price_before_discount: product.price_before_discount,
            status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION,
          }
          const addedPurchase = await new PurchaseModel(purchase).save()
          data = await PurchaseModel.findById(addedPurchase._id).populate({
            path: 'product',
            populate: {
              path: 'category',
            },
          })
        }
        purchases.push(data)
      }
    } else {
      throw new ErrorHandler(STATUS.NOT_FOUND, 'Không tìm thấy sản phẩm')
    }
  }
  const response = {
    message: 'Mua thành công',
    data: purchases,
  }
  return responseSuccess(res, response)
}

export const getPurchases = async (req: Request, res: Response) => {
  const { status = STATUS_PURCHASE.ALL } = req.query
  const user_id = req.jwtDecoded.id
  let condition: any = {
    user: user_id,
    status: {
      $ne: STATUS_PURCHASE.IN_CART,
    },
  }
  if (Number(status) !== STATUS_PURCHASE.ALL) {
    condition.status = status
  }

  let purchases: any = await PurchaseModel.find(condition)
    .populate({
      path: 'product',
      populate: {
        path: 'category',
      },
    })
    .sort({
      createdAt: -1,
    })
    .lean()
  purchases = purchases.map((purchase) => {
    purchase.product = handleImageProduct(cloneDeep(purchase.product))
    return purchase
  })
  const response = {
    message: 'Lấy đơn mua thành công',
    data: purchases,
  }
  return responseSuccess(res, response)
}

export const deletePurchases = async (req: Request, res: Response) => {
  const purchase_ids = req.body
  const user_id = req.jwtDecoded.id
  const deletedData = await PurchaseModel.deleteMany({
    user: user_id,
    status: STATUS_PURCHASE.IN_CART,
    _id: { $in: purchase_ids },
  })
  return responseSuccess(res, {
    message: `Xoá ${deletedData.deletedCount} đơn thành công`,
    data: { deleted_count: deletedData.deletedCount },
  })
}

const stripe = require("stripe")(process.env.REACT_APP_STRIPE_SECRET_KEY);

export const createPaymentIntent = async (req: Request, res: Response) => {
  // console.log(`handler: event -> ${event}, context -> ${context}`);
  // console.log(req);
  if (!req.body) {
    return {
      statusCode: 200,
      body: "create payment intent but no event.body",
    };
  }
  try {

  
  const { purchases} = req.body;
  if(!purchases) {
    return responseSuccess(res,{message:'No products to checkout'})
  }
  //= 1 find user
  const userId = purchases && purchases[0]?.user
  // const userDB = await UserModel.findOne({_id:purchases[0]?.user}).exec()
  // console.log("🚀TCL: ~ file: purchase.controller.ts ~ line 267 ~ createPaymentIntent ~ userDB", userDB)
  //= 2 get user cart total
  //= get array of purchase ids from FE
  const purchaseIds = purchases.map(purchase => purchase._id)
  //= find all purchase in db by purchaseIds {array}
  const purchaseInDB: any = await PurchaseModel.find({'_id':{$in:purchaseIds}})
  // const purchaseInDB: any = await PurchaseModel.find({user:userId})
  //= 3 calculate cart total
  const cartTotal = purchaseInDB.reduce((total, item)=>
  {
    // console.log('total: ', total)
    return total += item.price * item.buy_count
    }
  ,0)



  // in reality:
  // we will send each of item_id in cart to our server and get the actual price
  // const data = axios.get('/products')
  // in this scenerio:
  const calculateOrderAmount = () => {
    // return total_amount + shipping_fee;
    return 1000
  };

  
    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount: cartTotal,
      currency: "usd",
      // currency: "vnd",
    });

    // return {
    //   statusCode: 200,
    //   body: ({ clientSecret: paymentIntent.client_secret }),
    // };
    const response = {
      message: 'payment token',
      data: { clientSecret: paymentIntent.client_secret },
    }
    return responseSuccess(res, response)
  } catch (error) {
    // console.log(error);
    // return {
    //   statusCode: 500,
    //   body: ({ msg: error.message }),
    // };
    throw new ErrorHandler(STATUS.INTERNAL_SERVER_ERROR, error.message)
  }
}